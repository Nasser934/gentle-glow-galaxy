BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(15);

-- Seed as the migration/test owner so RLS cannot affect fixture setup.
RESET ROLE;
INSERT INTO public.reports (
  id,
  slug,
  user_id,
  title,
  industry,
  inputs,
  output,
  is_public,
  display_id,
  source_mode
) VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'rls-private-report',
    '11111111-1111-4111-8111-111111111111',
    'Private RLS fixture',
    'Testing',
    '{}'::jsonb,
    '{}'::jsonb,
    false,
    'CAI-RLS-PRIVATE',
    'in_app'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'rls-public-report',
    '11111111-1111-4111-8111-111111111111',
    'Public RLS fixture',
    'Testing',
    '{}'::jsonb,
    '{}'::jsonb,
    true,
    'CAI-RLS-PUBLIC',
    'in_app'
  );

SET LOCAL ROLE anon;
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.reports WHERE id = '10000000-0000-4000-8000-000000000001' $$,
  ARRAY[0::bigint],
  'logged-out users cannot read private reports'
);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.reports WHERE id = '10000000-0000-4000-8000-000000000002' $$,
  ARRAY[1::bigint],
  'logged-out users can read explicitly public reports'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.reports WHERE id = '10000000-0000-4000-8000-000000000001' $$,
  ARRAY[1::bigint],
  'the owner can read a private report'
);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.reports WHERE id = '10000000-0000-4000-8000-000000000001' $$,
  ARRAY[0::bigint],
  'another authenticated user cannot read the private report'
);
SELECT results_eq(
  $$ WITH changed AS (
       UPDATE public.reports
          SET title = 'unauthorized update'
        WHERE id = '10000000-0000-4000-8000-000000000001'
        RETURNING 1
     ) SELECT count(*)::bigint FROM changed $$,
  ARRAY[0::bigint],
  'another user cannot update the private report'
);
SELECT results_eq(
  $$ WITH removed AS (
       DELETE FROM public.reports
        WHERE id = '10000000-0000-4000-8000-000000000001'
        RETURNING 1
     ) SELECT count(*)::bigint FROM removed $$,
  ARRAY[0::bigint],
  'another user cannot delete the private report'
);
SELECT throws_ok(
  $$ INSERT INTO public.reports (
       id, slug, user_id, title, inputs, output, is_public, display_id, source_mode
     ) VALUES (
       '10000000-0000-4000-8000-000000000003',
       'rls-forged-owner',
       '11111111-1111-4111-8111-111111111111',
       'forged owner',
       '{}'::jsonb,
       '{}'::jsonb,
       false,
       'CAI-RLS-FORGED',
       'in_app'
     ) $$,
  '42501',
  'new row violates row-level security policy for table "reports"',
  'an authenticated user cannot insert a report for another owner'
);

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT results_eq(
  $$ WITH changed AS (
       UPDATE public.reports
          SET title = 'owner update'
        WHERE id = '10000000-0000-4000-8000-000000000001'
        RETURNING 1
     ) SELECT count(*)::bigint FROM changed $$,
  ARRAY[1::bigint],
  'the owner retains update access'
);

RESET ROLE;
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.reports'::regclass),
  'RLS remains enabled on reports'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reports'
      AND policyname = 'Public reports viewable by slug'
      AND cmd = 'SELECT'
  ),
  'the owner-or-public SELECT policy remains installed'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.reports
    WHERE display_id = 'CAI-2026-00000094'
  )
  OR EXISTS (
    SELECT 1
    FROM public.reports
    WHERE display_id = 'CAI-2026-00000094'
      AND source_mode = 'external_agent'
      AND canonical_validated
      AND output ? 'scores'
      AND output ? 'market'
      AND output ? 'financials'
      AND output ? 'risks'
      AND output ? 'fundingMix'
      AND output ? 'competitors'
      AND output ? 'recommendations'
      AND output ? 'nextSteps'
  ),
  'CAI-2026-00000094 is canonical whenever the production fixture exists'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.reports'::regclass
      AND conname = 'reports_external_canonical_shape'
      AND contype = 'c'
  ),
  'canonical external reports retain the database shape invariant'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.get_report_export_preflight(uuid)',
    'EXECUTE'
  ),
  'logged-out users cannot execute the export preflight'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT results_eq(
  $$ SELECT count(*)::bigint
       FROM public.get_report_export_preflight(
         '10000000-0000-4000-8000-000000000001'
       ) $$,
  ARRAY[1::bigint],
  'the owner can preflight a private report'
);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT results_eq(
  $$ SELECT count(*)::bigint
       FROM public.get_report_export_preflight(
         '10000000-0000-4000-8000-000000000001'
       ) $$,
  ARRAY[0::bigint],
  'the export preflight preserves report RLS for another user'
);

SELECT * FROM finish();
ROLLBACK;
