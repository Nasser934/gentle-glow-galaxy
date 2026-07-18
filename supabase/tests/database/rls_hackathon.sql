begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

-- Fixed identities make policy behavior deterministic without depending on
-- external Auth APIs.
create temporary table test_ids(owner_id uuid, reviewer_id uuid) on commit drop;
insert into test_ids values (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated', 'owner@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-4222-8222-222222222222',
  'authenticated', 'authenticated', 'reviewer@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.reports (
  id, user_id, title, industry, inputs, output, slug, is_public
) values
(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'Private report', 'Technology', '{}'::jsonb,
  '{"scores":{"overall":7.1},"scoringAudit":{},"reportSchemaVersion":"2.0.0"}'::jsonb,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', false
),
(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111',
  'Public report', 'Technology', '{}'::jsonb,
  '{"scores":{"overall":7.1},"scoringAudit":{},"reportSchemaVersion":"2.0.0"}'::jsonb,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', true
);

select ok(
  (select not is_public from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'private report remains private'
);
select ok(
  (select slug ~ '^[A-Za-z0-9_-]{20,64}$' from public.reports where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'stored slugs are URL-safe'
);
select isnt(
  (select display_id from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  (select display_id from public.reports where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'database-backed display IDs are unique'
);
select is(
  (select output ->> 'reportId' from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  (select display_id from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'stored canonical output uses the database-backed display ID'
);
select ok(
  (select canonical_validated from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'new reports are marked for canonical validation'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::integer from public.reports), 2, 'owner can load own reports');
select is((select count(*)::integer from public.get_report_by_slug('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')), 1, 'owner can resolve own private slug');

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::integer from public.reports), 0, 'different signed-in user cannot enumerate owner reports');
select is((select count(*)::integer from public.get_report_by_slug('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')), 0, 'different user cannot open private report');
select is((select count(*)::integer from public.get_report_by_slug('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')), 1, 'different user can open exact public slug');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is((select count(*)::integer from public.reports), 0, 'signed-out visitor cannot enumerate reports');
select is((select count(*)::integer from public.get_report_by_slug('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')), 1, 'signed-out visitor can open exact public slug');
select is((select count(*)::integer from public.get_report_by_slug('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')), 0, 'signed-out visitor cannot open private slug');

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.report_comments(report_id, user_id, body)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Public review comment')$$,
  'signed-in reviewer can comment on a public report'
);
select is(
  (select count(*)::integer from public.notifications),
  0,
  'reviewer cannot read the notification created for the report owner'
);
select throws_ok(
  $$insert into public.notifications(user_id, actor_id, kind, title)
    values ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'comment', 'Fabricated')$$,
  '42501', null,
  'clients cannot fabricate notifications'
);
select throws_ok(
  $$insert into public.report_comments(report_id, user_id, body)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'Private comment')$$,
  '42501', null,
  'reviewer cannot comment on a private report'
);

update public.reports set status = 'approved' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is(
  (select status::text from public.get_report_by_slug('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')),
  'draft',
  'public reviewer cannot change report status'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.notifications where kind = 'comment'),
  1,
  'report owner receives exactly one comment notification'
);

update public.reports set status = 'in_review' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is(
  (select status::text from public.reports where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'in_review',
  'owner can change report status'
);
select is(
  (select count(*)::integer from public.report_status_history
    where report_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      and from_status = 'draft' and to_status = 'in_review'),
  1,
  'status history is derived from the real report transition'
);
select throws_ok(
  $$insert into public.report_status_history(report_id, changed_by, from_status, to_status)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '11111111-1111-4111-8111-111111111111',
      'draft', 'approved'
    )$$,
  '42501', null,
  'owner cannot fabricate a status history event'
);

select ok(
  (select allowed from public.begin_analysis_request(
    'analyze-concept',
    'analysis-request-0001',
    'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    'sha256:1111111111111111111111111111111111111111111111111111111111111111'
  )),
  'first persistent analysis request is allowed'
);
select is(
  (select reason from public.begin_analysis_request(
    'analyze-concept',
    'analysis-request-0001',
    'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    'sha256:1111111111111111111111111111111111111111111111111111111111111111'
  )),
  'duplicate_request',
  'parallel duplicate analysis request is rejected idempotently'
);
select is(
  (select allowed from public.begin_analysis_request(
    'invented-function',
    'analysis-request-0002',
    'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    null
  )),
  false,
  'usage-control RPC rejects unsupported function names'
);
select ok(
  public.complete_analysis_request(
    (select id from public.analysis_requests where function_name = 'analyze-concept' limit 1),
    'completed',
    'test-model',
    'test-prompt',
    '{"prompt_tokens":12,"brief":"must not be stored"}'::jsonb,
    'partial',
    null
  ),
  'owner can complete their running analysis request'
);

reset role;
select is(
  (select usage_metadata from public.analysis_requests where function_name = 'analyze-concept' limit 1),
  '{"prompt_tokens":12}'::jsonb,
  'analysis logging strips unapproved sensitive metadata keys'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(id)::integer from public.analysis_requests),
  0,
  'analysis request metadata is isolated from other users'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

update public.reports
set canonical_validated = false
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select ok(
  (select canonical_validated from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'clients cannot disable canonical validation'
);
select throws_ok(
  $$update public.reports
    set output = '{"scores":{}}'::jsonb
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null,
  'replacing report output requires the canonical schema'
);

update public.reports set is_public = false where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select ok(
  (select not is_public from public.reports where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'owner can revoke sharing'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select is((select count(*)::integer from public.get_report_by_slug('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')), 0, 'revoked report immediately stops anonymous access');
select is((select count(*)::integer from public.report_comments where report_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0, 'revoked report comments stop external access');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
delete from public.reports where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is((select count(*)::integer from public.reports where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0, 'owner can delete report');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select is((select count(*)::integer from public.get_report_by_slug('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')), 0, 'deleted report cannot be opened externally');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$insert into public.reports(user_id, title, inputs, output, slug)
    values (
      '11111111-1111-4111-8111-111111111111', 'Duplicate slug', '{}'::jsonb,
      '{"scores":{"overall":5},"scoringAudit":{},"reportSchemaVersion":"2.0.0"}'::jsonb,
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    )$$,
  '23505', null,
  'duplicate slugs are rejected'
);
select throws_ok(
  $$insert into public.reports(user_id, title, inputs, output, slug)
    values (
      '11111111-1111-4111-8111-111111111111', 'Unsafe slug', '{}'::jsonb,
      '{"scores":{"overall":5},"scoringAudit":{},"reportSchemaVersion":"2.0.0"}'::jsonb,
      'unsafe/base64='
    )$$,
  '23514', null,
  'unsafe slugs are rejected'
);
select throws_ok(
  $$insert into public.report_comments(report_id, user_id, body)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '')$$,
  '23514', null,
  'empty comments are rejected'
);

select lives_ok(
  $$insert into public.reports(user_id, title, inputs, output, slug, save_operation_key)
    values (
      '11111111-1111-4111-8111-111111111111', 'Idempotent save', '{}'::jsonb,
      '{"scores":{"overall":5},"scoringAudit":{},"reportSchemaVersion":"2.0.0"}'::jsonb,
      'cccccccccccccccccccccccccccccccc',
      'save_operation_0001'
    )$$,
  'first report save operation key is accepted'
);
select throws_ok(
  $$insert into public.reports(user_id, title, inputs, output, slug, save_operation_key)
    values (
      '11111111-1111-4111-8111-111111111111', 'Duplicate idempotent save', '{}'::jsonb,
      '{"scores":{"overall":5},"scoringAudit":{},"reportSchemaVersion":"2.0.0"}'::jsonb,
      'dddddddddddddddddddddddddddddddd',
      'save_operation_0001'
    )$$,
  '23505', null,
  'duplicate report save operation key is rejected'
);

select * from finish();
rollback;
