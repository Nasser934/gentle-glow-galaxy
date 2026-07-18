begin;

create extension if not exists pgtap with schema extensions;
select plan(59);

create or replace function pg_temp.canonical_report(p_score numeric)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'reportId', 'temporary-model-id',
    'reportSchemaVersion', '2.0.0',
    'scores', jsonb_build_object('overall', p_score),
    'scoringAudit', '{}'::jsonb,
    'qualityMetadata', jsonb_build_object(
      'modelId', 'test-model',
      'promptVersion', 'test-prompt',
      'scoringEngineVersion', 'test-engine',
      'reportSchemaVersion', '2.0.0',
      'inputHash', 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      'generationTimestamp', '2026-07-18T12:00:00.000Z',
      'researchTimestamp', '2026-07-18T12:00:00.000Z'
    ),
    'sources', '[]'::jsonb,
    'claims', '[]'::jsonb,
    'validationWarnings', '[]'::jsonb,
    'normalizedFigures', '{}'::jsonb,
    'decision', '{}'::jsonb
  );
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated', 'owner@example.test', '', now(),
  '{}'::jsonb, '{"display_name":"Owner"}'::jsonb, now(), now()
),
(
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-4222-8222-222222222222',
  'authenticated', 'authenticated', 'reviewer@example.test', '', now(),
  '{}'::jsonb, '{"display_name":"Reviewer"}'::jsonb, now(), now()
);

insert into public.reports (
  id, user_id, title, industry, inputs, output, slug, is_public
) values
(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'Private report', 'Technology', '{}'::jsonb,
  pg_temp.canonical_report(7.1),
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', false
),
(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111',
  'Public report', 'Technology', '{}'::jsonb,
  pg_temp.canonical_report(7.2),
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', true
);

insert into public.report_slug_aliases(old_slug, report_id)
values ('legacy-public-report-link', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

select ok(
  (select not is_public from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '1 private report remains private'
);
select ok(
  (select is_public from public.reports where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '2 public report remains public'
);
select ok(
  (select bool_and(slug ~ '^[A-Za-z0-9_-]{20,64}$') from public.reports),
  '3 stored slugs are URL-safe'
);
select isnt(
  (select display_id from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  (select display_id from public.reports where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '4 database-backed display IDs are unique'
);
select is(
  (select output ->> 'reportId' from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  (select display_id from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '5 stored output uses the database-backed display ID'
);
select ok(
  (select canonical_validated from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '6 canonical output is marked validated'
);
select is(
  (select model_id from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'test-model',
  '7 model metadata is derived by the database'
);
select is(
  (select input_hash from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  '8 input hash is derived by the database'
);
select is(
  (select root_report_id from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  '9 root report points to itself'
);
select is(
  (select count(*)::integer from public.report_slug_aliases where report_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1,
  '10 legacy slug alias is retained'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::integer from public.reports), 2, '11 owner can enumerate own reports');
select is(
  (select count(*)::integer from public.get_report_by_slug('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
  1,
  '12 owner can resolve own private slug'
);
select is((select count(*)::integer from public.profiles), 1, '13 owner sees only their profile');

update public.reports
set status = 'in_review'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(
  (select status::text from public.reports where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'in_review',
  '14 owner can change report status'
);
select is(
  (select count(*)::integer from public.get_report_status_history('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  1,
  '15 status history is derived from the actual transition'
);
select throws_ok(
  $$insert into public.report_status_history(report_id, changed_by, from_status, to_status)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111',
      'draft', 'approved'
    )$$,
  '42501', null,
  '16 clients cannot fabricate status history'
);
select throws_ok(
  $$update public.reports
    set canonical_validated = false
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '42501', null,
  '17 clients cannot alter canonical validation flags'
);
select throws_ok(
  $$update public.reports
    set output = pg_temp.canonical_report(4.0)
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '42501', null,
  '18 clients cannot replace database-audited output'
);

select ok(
  (select allowed from public.begin_analysis_request(
    'analyze-concept',
    'analysis-request-0001',
    'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    'sha256:1111111111111111111111111111111111111111111111111111111111111111'
  )),
  '19 first persistent analysis request is allowed'
);
select is(
  (select reason from public.begin_analysis_request(
    'analyze-concept',
    'analysis-request-0001',
    'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    'sha256:1111111111111111111111111111111111111111111111111111111111111111'
  )),
  'duplicate_request',
  '20 duplicate analysis request is rejected idempotently'
);
select is(
  (select allowed from public.begin_analysis_request(
    'invented-function',
    'analysis-request-0002',
    'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    null
  )),
  false,
  '21 unsupported analysis function is rejected'
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
  '22 owner can complete a running analysis request'
);

select lives_ok(
  $$insert into public.reports(user_id, title, inputs, output, save_operation_key)
    values (
      '11111111-1111-4111-8111-111111111111',
      'Idempotent save',
      '{}'::jsonb,
      pg_temp.canonical_report(5.0),
      'save_operation_0001'
    )$$,
  '23 first report save operation key is accepted'
);
select throws_ok(
  $$insert into public.reports(user_id, title, inputs, output, save_operation_key)
    values (
      '11111111-1111-4111-8111-111111111111',
      'Duplicate idempotent save',
      '{}'::jsonb,
      pg_temp.canonical_report(5.0),
      'save_operation_0001'
    )$$,
  '23505', null,
  '24 duplicate report save operation key is rejected'
);
select throws_ok(
  $$insert into public.reports(user_id, title, inputs, output, slug)
    values (
      '11111111-1111-4111-8111-111111111111',
      'Client-selected slug',
      '{}'::jsonb,
      pg_temp.canonical_report(5.0),
      'clientcontrolledslug00000000000'
    )$$,
  '42501', null,
  '25 clients cannot choose report slugs'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::integer from public.reports), 0, '26 reviewer cannot enumerate owner reports');
select is(
  (select count(*)::integer from public.get_report_by_slug('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
  0,
  '27 reviewer cannot open a private report'
);
select is(
  (select count(*)::integer from public.get_report_by_slug('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')),
  1,
  '28 reviewer can open an exact public slug'
);
select is(
  (select count(*)::integer from public.get_report_by_slug('legacy-public-report-link')),
  1,
  '29 legacy public slug aliases still resolve'
);
select lives_ok(
  $$insert into public.report_comments(report_id, user_id, body)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '22222222-2222-4222-8222-222222222222',
      'Public review comment'
    )$$,
  '30 signed-in reviewer can comment on a public report'
);
select throws_ok(
  $$insert into public.report_comments(report_id, user_id, body)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      'Private comment'
    )$$,
  '42501', null,
  '31 reviewer cannot comment on a private report'
);
update public.reports
set status = 'approved'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is(
  (select status::text from public.get_report_by_slug('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')),
  'draft',
  '32 reviewer cannot change report status'
);
select throws_ok(
  $$select count(*) from public.report_comments$$,
  '42501', null,
  '33 discussion rows cannot be enumerated directly'
);
select is(
  (select count(*)::integer from public.get_report_comments('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null)),
  1,
  '34 exact-report comments RPC returns the public discussion'
);
select is(
  (select count(*)::integer from public.get_report_comment_profiles('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),
  1,
  '35 exact-report profile RPC returns only participating profiles'
);
select is((select count(*)::integer from public.profiles), 1, '36 reviewer sees only their own direct profile row');
select throws_ok(
  $$insert into public.notifications(user_id, actor_id, kind, title)
    values (
      '22222222-2222-4222-8222-222222222222',
      '22222222-2222-4222-8222-222222222222',
      'comment', 'Fabricated'
    )$$,
  '42501', null,
  '37 clients cannot fabricate notifications'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*)::integer from public.notifications where kind = 'comment'),
  1,
  '38 report owner receives one comment notification'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select count(*) from public.reports$$,
  '42501', null,
  '39 anonymous visitors cannot enumerate reports'
);
select is(
  (select count(*)::integer from public.get_report_by_slug('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')),
  1,
  '40 anonymous visitor can open an exact public slug'
);
select is(
  (select count(*)::integer from public.get_report_by_slug('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')),
  0,
  '41 anonymous visitor cannot open a private slug'
);
select throws_ok(
  $$select count(*) from public.report_comments$$,
  '42501', null,
  '42 anonymous visitors cannot enumerate comments'
);
select is(
  (select count(*)::integer from public.get_report_comments('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null)),
  1,
  '43 anonymous visitor can read comments for one exact public report'
);
select is(
  (select count(*)::integer from public.get_report_comment_profiles('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),
  1,
  '44 anonymous visitor receives only profiles for that public discussion'
);
select throws_ok(
  $$select count(*) from public.profiles$$,
  '42501', null,
  '45 anonymous visitors cannot enumerate profiles'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.set_report_group_archived('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true),
  1,
  '46 archive operation updates the full report group atomically'
);
select ok(
  (select archived_at is not null and not is_public from public.reports where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '47 archived report is private'
);
select is(
  (select count(*)::integer from public.get_report_by_slug('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')),
  0,
  '48 archived report cannot be opened by slug'
);
select throws_ok(
  $$update public.reports
    set is_public = true
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  '23514', null,
  '49 archived report cannot be shared'
);
select is(
  public.set_report_group_archived('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false),
  1,
  '50 restore operation updates the report group atomically'
);
select ok(
  (select archived_at is null and not is_public from public.reports where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '51 restored reports remain private'
);

reset role;
select is(
  (select usage_metadata from public.analysis_requests where function_name = 'analyze-concept' limit 1),
  '{"prompt_tokens":12}'::jsonb,
  '52 analysis logging strips unapproved sensitive metadata keys'
);
select ok(
  (select completed_at is not null from public.analysis_requests where function_name = 'analyze-concept' limit 1),
  '53 completed analysis requests have a completion timestamp'
);
select throws_ok(
  $$insert into public.reports(user_id, title, inputs, output, slug)
    values (
      '11111111-1111-4111-8111-111111111111',
      'Unsafe slug',
      '{}'::jsonb,
      pg_temp.canonical_report(5.0),
      'unsafe/base64='
    )$$,
  '23514', null,
  '54 unsafe slugs are rejected'
);
select throws_ok(
  $$insert into public.reports(user_id, title, inputs, output, slug)
    values (
      '11111111-1111-4111-8111-111111111111',
      'Duplicate slug',
      '{}'::jsonb,
      pg_temp.canonical_report(5.0),
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    )$$,
  '23505', null,
  '55 duplicate slugs are rejected'
);
select throws_ok(
  $$insert into public.reports(user_id, title, inputs, output)
    values (
      '11111111-1111-4111-8111-111111111111',
      'Invalid canonical output',
      '{}'::jsonb,
      '{"scores":{"overall":5}}'::jsonb
    )$$,
  '23514', null,
  '56 incomplete canonical output is rejected'
);

insert into public.reports(id, user_id, title, inputs, output, parent_report_id)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '11111111-1111-4111-8111-111111111111',
  'Child report',
  '{}'::jsonb,
  pg_temp.canonical_report(6.0),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);
select is(
  (select root_report_id from public.reports where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  '57 child report inherits the correct root'
);
select is(
  (select parent_report_id from public.reports where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  '58 report version lineage is flattened to the root'
);
select throws_ok(
  $$update public.reports
    set parent_report_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null,
  '59 report lineage cycles are rejected'
);

select * from finish();
rollback;
