-- Canonicalize legacy external-agent reports in place.
--
-- The application and MCP tools now share one TypeScript/Zod contract. This
-- migration is deliberately a one-time data adapter only: it translates legacy
-- aliases, recalculates FMART-O/CapEx totals, and preserves the original JSON in
-- external_agent_metadata. It does not become a second ongoing report format.

BEGIN;

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS canonical_validated boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.reports.canonical_validated IS
  'True only after reports.inputs/output pass the canonical ConceptInputs and FeasibilityReport contract.';

-- Instantiate pg_temp so the migration-only helper functions never become
-- permanent public API.
CREATE TEMP TABLE _concept_ai_external_backfill_marker (id integer) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.cai_text(value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  item jsonb;
  item_text text;
  pieces text[] := ARRAY[]::text[];
  result text;
BEGIN
  IF value IS NULL OR value = 'null'::jsonb THEN
    RETURN '';
  END IF;
  CASE jsonb_typeof(value)
    WHEN 'string' THEN RETURN btrim(value #>> '{}');
    WHEN 'number' THEN RETURN value #>> '{}';
    WHEN 'boolean' THEN RETURN value #>> '{}';
    WHEN 'array' THEN
      FOR item IN SELECT element FROM jsonb_array_elements(value) AS items(element)
      LOOP
        item_text := pg_temp.cai_text(item);
        IF item_text <> '' THEN pieces := array_append(pieces, item_text); END IF;
      END LOOP;
      RETURN array_to_string(pieces, E'\n');
    ELSE RETURN '';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.cai_num(value jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  raw text;
  matched text;
  parsed numeric;
BEGIN
  IF value IS NULL OR value = 'null'::jsonb THEN RETURN NULL; END IF;
  raw := replace(lower(pg_temp.cai_text(value)), ',', '');
  matched := substring(raw FROM '-?[0-9]+(?:\.[0-9]+)?');
  IF matched IS NULL THEN RETURN NULL; END IF;
  parsed := matched::numeric;
  IF raw ~ '(trillion|\mtn\M|\mt\M)' THEN RETURN parsed * 1000000000000; END IF;
  IF raw ~ '(billion|\mbn\M|\mb\M)' THEN RETURN parsed * 1000000000; END IF;
  IF raw ~ '(million|\mmn\M|\mm\M)' THEN RETURN parsed * 1000000; END IF;
  IF raw ~ '(thousand|\mk\M)' THEN RETURN parsed * 1000; END IF;
  RETURN parsed;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.cai_strings(value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  item jsonb;
  item_text text;
  result jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(value) <> 'array' THEN RETURN result; END IF;
  FOR item IN SELECT element FROM jsonb_array_elements(value) AS rows(element)
  LOOP
    IF jsonb_typeof(item) = 'object' THEN
      item_text := pg_temp.cai_text(coalesce(
        item->'text',
        item->'title',
        item->'name',
        item->'action',
        item->'step',
        item->'recommendation'
      ));
    ELSE
      item_text := pg_temp.cai_text(item);
    END IF;
    IF item_text <> '' THEN result := result || jsonb_build_array(item_text); END IF;
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.cai_level(value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE normalized text := lower(pg_temp.cai_text(value));
BEGIN
  IF normalized IN ('high', 'critical', 'severe') THEN RETURN 'High'; END IF;
  IF normalized IN ('med', 'medium', 'material', 'moderate') THEN RETURN 'Med'; END IF;
  RETURN 'Low';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.cai_score(value jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE parsed numeric := pg_temp.cai_num(value);
BEGIN
  IF parsed IS NULL OR parsed < 0 OR parsed > 100 THEN RETURN NULL; END IF;
  IF parsed > 10 THEN parsed := parsed / 10; END IF;
  RETURN round(parsed, 2);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.cai_external_report(
  legacy_inputs jsonb,
  legacy_output jsonb,
  row_title text,
  row_industry text,
  row_display_id text,
  row_created_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  i jsonb := coalesce(legacy_inputs, '{}'::jsonb);
  o jsonb := coalesce(legacy_output, '{}'::jsonb);
  overview jsonb := CASE WHEN jsonb_typeof(i->'overview') = 'object' THEN i->'overview' ELSE '{}'::jsonb END;
  scope jsonb := CASE WHEN jsonb_typeof(i->'scope') = 'object' THEN i->'scope' ELSE '{}'::jsonb END;
  operating_model jsonb := CASE WHEN jsonb_typeof(i->'operating_model') = 'object' THEN i->'operating_model' ELSE '{}'::jsonb END;
  scores_source jsonb;
  rationale jsonb;
  confidence_source jsonb;
  verdict_source jsonb;
  market_source jsonb;
  customer_source jsonb;
  financial_source jsonb;
  capex_source jsonb;
  opex_source jsonb;
  scenario_source jsonb;
  competitor_source jsonb;
  funding_source jsonb;
  claims_source jsonb;
  growth_source jsonb;
  item jsonb;
  source_item jsonb;
  normalized_inputs jsonb;
  normalized_output jsonb;
  scores jsonb;
  market jsonb;
  customer jsonb;
  competitors jsonb := '[]'::jsonb;
  financials jsonb;
  capex jsonb := '[]'::jsonb;
  opex jsonb := '[]'::jsonb;
  scenarios jsonb := '[]'::jsonb;
  risks jsonb := '[]'::jsonb;
  funding_mix jsonb := '[]'::jsonb;
  growth_chart jsonb := '[]'::jsonb;
  research jsonb;
  citations jsonb := '[]'::jsonb;
  web_signals jsonb := '[]'::jsonb;
  key_signals jsonb := '[]'::jsonb;
  competitor_mentions jsonb := '[]'::jsonb;
  recommendations jsonb;
  next_steps jsonb;
  warnings jsonb;
  category text;
  amount numeric;
  low_value numeric;
  high_value numeric;
  annual_value numeric;
  monthly_value numeric;
  row_year numeric;
  capex_low numeric := 0;
  capex_high numeric := 0;
  capex_mid numeric := 0;
  financial_score numeric;
  market_score numeric;
  achievability_score numeric;
  risk_score numeric;
  timing_score numeric;
  operational_score numeric;
  weight_financial numeric;
  weight_market numeric;
  weight_achievability numeric;
  weight_risk numeric;
  weight_timing numeric;
  weight_operational numeric;
  weight_total numeric;
  overall_score numeric;
  verdict text;
  confidence_default numeric;
  executive_summary text;
  investment_range text;
  break_even_summary text;
  business_model_text text := '';
  revenue_model_text text := '';
  signal_text text;
  implication_text text;
  citation_url text;
  high_claim_count integer := 0;
  claim_count integer := 0;
  invalid_citation_count integer := 0;
BEGIN
  scores_source := coalesce(o->'scores', o->'fmarto_scores', o->'fmartoScores', o->'fmarto', '{}'::jsonb);
  rationale := CASE WHEN jsonb_typeof(scores_source->'rationale') = 'object'
    THEN scores_source->'rationale' ELSE '{}'::jsonb END;
  confidence_source := CASE WHEN jsonb_typeof(scores_source->'confidence') = 'object'
    THEN scores_source->'confidence' ELSE '{}'::jsonb END;
  verdict_source := CASE WHEN jsonb_typeof(o->'verdict') = 'object'
    THEN o->'verdict' ELSE '{}'::jsonb END;

  financial_score := pg_temp.cai_score(coalesce(scores_source->'financial', scores_source->'feasibility'));
  market_score := pg_temp.cai_score(scores_source->'market');
  achievability_score := pg_temp.cai_score(coalesce(
    scores_source->'achievability',
    scores_source->'architecture',
    scores_source->'technical'
  ));
  risk_score := pg_temp.cai_score(scores_source->'risk');
  timing_score := pg_temp.cai_score(coalesce(scores_source->'timing', scores_source->'timeline'));
  operational_score := pg_temp.cai_score(coalesce(scores_source->'operational', scores_source->'operations'));

  IF financial_score IS NULL OR market_score IS NULL OR achievability_score IS NULL
    OR risk_score IS NULL OR timing_score IS NULL OR operational_score IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'path', 'output.scores',
        'message', 'Legacy FMART-O dimensions could not be converted safely'
      ))
    );
  END IF;

  weight_financial := pg_temp.cai_num(scores_source#>'{weights,financial}');
  weight_market := pg_temp.cai_num(scores_source#>'{weights,market}');
  weight_achievability := pg_temp.cai_num(scores_source#>'{weights,achievability}');
  weight_risk := pg_temp.cai_num(scores_source#>'{weights,risk}');
  weight_timing := pg_temp.cai_num(scores_source#>'{weights,timing}');
  weight_operational := pg_temp.cai_num(scores_source#>'{weights,operational}');
  weight_total := coalesce(weight_financial, 0) + coalesce(weight_market, 0)
    + coalesce(weight_achievability, 0) + coalesce(weight_risk, 0)
    + coalesce(weight_timing, 0) + coalesce(weight_operational, 0);
  IF weight_financial IS NULL OR weight_market IS NULL OR weight_achievability IS NULL
    OR weight_risk IS NULL OR weight_timing IS NULL OR weight_operational IS NULL
    OR weight_financial < 0 OR weight_market < 0 OR weight_achievability < 0
    OR weight_risk < 0 OR weight_timing < 0 OR weight_operational < 0
    OR weight_total <= 0 THEN
    weight_financial := 1.0 / 6.0;
    weight_market := 1.0 / 6.0;
    weight_achievability := 1.0 / 6.0;
    weight_risk := 1.0 / 6.0;
    weight_timing := 1.0 / 6.0;
    weight_operational := 1.0 / 6.0;
  ELSE
    weight_financial := weight_financial / weight_total;
    weight_market := weight_market / weight_total;
    weight_achievability := weight_achievability / weight_total;
    weight_risk := weight_risk / weight_total;
    weight_timing := weight_timing / weight_total;
    weight_operational := weight_operational / weight_total;
  END IF;

  overall_score := round(
    financial_score * weight_financial
    + market_score * weight_market
    + achievability_score * weight_achievability
    + risk_score * weight_risk
    + timing_score * weight_timing
    + operational_score * weight_operational,
    2
  );
  verdict := CASE
    WHEN overall_score >= 7.5 THEN 'PROCEED'
    WHEN overall_score >= 6.0 THEN 'PROCEED WITH CAUTION'
    WHEN overall_score >= 4.5 THEN 'REVISE'
    ELSE 'DO NOT PROCEED'
  END;
  confidence_default := coalesce(pg_temp.cai_num(verdict_source->'confidence'), 50);
  IF confidence_default <= 1 THEN confidence_default := confidence_default * 100; END IF;
  confidence_default := greatest(0, least(100, confidence_default));

  scores := jsonb_build_object(
    'financial', financial_score,
    'market', market_score,
    'achievability', achievability_score,
    'risk', risk_score,
    'timing', timing_score,
    'operational', operational_score,
    'overall', overall_score,
    'verdict', verdict,
    'financialFinding', pg_temp.cai_text(coalesce(
      scores_source->'financialFinding', scores_source->'financial_finding',
      rationale->'financial', rationale->'feasibility'
    )),
    'marketFinding', pg_temp.cai_text(coalesce(
      scores_source->'marketFinding', scores_source->'market_finding', rationale->'market'
    )),
    'achievabilityFinding', pg_temp.cai_text(coalesce(
      scores_source->'achievabilityFinding', scores_source->'achievability_finding',
      rationale->'achievability', rationale->'architecture', rationale->'technical'
    )),
    'riskFinding', pg_temp.cai_text(coalesce(
      scores_source->'riskFinding', scores_source->'risk_finding', rationale->'risk'
    )),
    'timingFinding', pg_temp.cai_text(coalesce(
      scores_source->'timingFinding', scores_source->'timing_finding',
      rationale->'timing', rationale->'timeline'
    )),
    'operationalFinding', pg_temp.cai_text(coalesce(
      scores_source->'operationalFinding', scores_source->'operational_finding',
      rationale->'operational', rationale->'operations'
    )),
    'weights', jsonb_build_object(
      'financial', weight_financial,
      'market', weight_market,
      'achievability', weight_achievability,
      'risk', weight_risk,
      'timing', weight_timing,
      'operational', weight_operational
    ),
    'confidence', jsonb_build_object(
      'financial', greatest(0, least(100, CASE
        WHEN coalesce(pg_temp.cai_num(confidence_source->'financial'), confidence_default) <= 1
          THEN coalesce(pg_temp.cai_num(confidence_source->'financial'), confidence_default) * 100
        ELSE coalesce(pg_temp.cai_num(confidence_source->'financial'), confidence_default) END)),
      'market', greatest(0, least(100, CASE
        WHEN coalesce(pg_temp.cai_num(confidence_source->'market'), confidence_default) <= 1
          THEN coalesce(pg_temp.cai_num(confidence_source->'market'), confidence_default) * 100
        ELSE coalesce(pg_temp.cai_num(confidence_source->'market'), confidence_default) END)),
      'achievability', greatest(0, least(100, CASE
        WHEN coalesce(pg_temp.cai_num(confidence_source->'achievability'), confidence_default) <= 1
          THEN coalesce(pg_temp.cai_num(confidence_source->'achievability'), confidence_default) * 100
        ELSE coalesce(pg_temp.cai_num(confidence_source->'achievability'), confidence_default) END)),
      'risk', greatest(0, least(100, CASE
        WHEN coalesce(pg_temp.cai_num(confidence_source->'risk'), confidence_default) <= 1
          THEN coalesce(pg_temp.cai_num(confidence_source->'risk'), confidence_default) * 100
        ELSE coalesce(pg_temp.cai_num(confidence_source->'risk'), confidence_default) END)),
      'timing', greatest(0, least(100, CASE
        WHEN coalesce(pg_temp.cai_num(confidence_source->'timing'), confidence_default) <= 1
          THEN coalesce(pg_temp.cai_num(confidence_source->'timing'), confidence_default) * 100
        ELSE coalesce(pg_temp.cai_num(confidence_source->'timing'), confidence_default) END)),
      'operational', greatest(0, least(100, CASE
        WHEN coalesce(pg_temp.cai_num(confidence_source->'operational'), confidence_default) <= 1
          THEN coalesce(pg_temp.cai_num(confidence_source->'operational'), confidence_default) * 100
        ELSE coalesce(pg_temp.cai_num(confidence_source->'operational'), confidence_default) END))
    ),
    'rationale', jsonb_build_object(
      'financial', pg_temp.cai_text(coalesce(rationale->'financial', rationale->'feasibility')),
      'market', pg_temp.cai_text(rationale->'market'),
      'achievability', pg_temp.cai_text(coalesce(
        rationale->'achievability', rationale->'architecture', rationale->'technical'
      )),
      'risk', pg_temp.cai_text(rationale->'risk'),
      'timing', pg_temp.cai_text(coalesce(rationale->'timing', rationale->'timeline')),
      'operational', pg_temp.cai_text(coalesce(rationale->'operational', rationale->'operations'))
    )
  );

  IF jsonb_typeof(i->'business_model') = 'array' THEN
    SELECT
      coalesce(string_agg(
        concat_ws(
          ': ',
          nullif(pg_temp.cai_text(element->'offer'), ''),
          nullif(pg_temp.cai_text(element->'pricing_assumption'), '')
        ),
        E'\n'
      ), ''),
      coalesce(string_agg(pg_temp.cai_text(element->'pricing_assumption'), E'\n'), '')
      INTO business_model_text, revenue_model_text
      FROM jsonb_array_elements(i->'business_model') AS rows(element);
  END IF;

  normalized_inputs := jsonb_build_object(
    'projectName', coalesce(
      nullif(pg_temp.cai_text(coalesce(i->'projectName', i->'project_name', i->'working_name', i->'title', i->'name')), ''),
      nullif(pg_temp.cai_text(coalesce(overview->'projectName', overview->'project_name', overview->'title', overview->'name')), ''),
      row_title,
      ''
    ),
    'industry', coalesce(
      nullif(pg_temp.cai_text(coalesce(i->'industry', i->'sector')), ''),
      nullif(pg_temp.cai_text(coalesce(overview->'industry', overview->'sector')), ''),
      row_industry,
      ''
    ),
    'location', coalesce(
      nullif(pg_temp.cai_text(coalesce(i->'location', i->'region', i->'geography')), ''),
      pg_temp.cai_text(coalesce(overview->'location', overview->'region', overview->'geography'))
    ),
    'description', coalesce(
      nullif(pg_temp.cai_text(coalesce(i->'description', CASE WHEN jsonb_typeof(i->'overview') <> 'object' THEN i->'overview' END, i->'summary')), ''),
      nullif(pg_temp.cai_text(coalesce(overview->'description', overview->'summary')), ''),
      pg_temp.cai_text(coalesce(CASE WHEN jsonb_typeof(i->'scope') <> 'object' THEN i->'scope' END, scope->'description', scope->'summary'))
    ),
    'strategicObjectives', coalesce(
      nullif(pg_temp.cai_text(coalesce(i->'strategicObjectives', i->'strategic_objectives', i->'objectives')), ''),
      nullif(pg_temp.cai_text(coalesce(overview->'strategicObjectives', overview->'strategic_objectives', overview->'objectives')), ''),
      pg_temp.cai_text(i->'value_proposition')
    ),
    'businessModel', coalesce(
      nullif(pg_temp.cai_text(i->'businessModel'), ''),
      business_model_text
    ),
    'revenueModel', coalesce(
      nullif(pg_temp.cai_text(i->'revenueModel'), ''),
      nullif(pg_temp.cai_text(i->'revenue_model'), ''),
      revenue_model_text
    ),
    'founderExperience', pg_temp.cai_text(coalesce(i->'founderExperience', i->'founder_experience', i->'sponsor_experience')),
    'budgetRange', pg_temp.cai_text(coalesce(i->'budgetRange', i->'budget_range', i->'budget')),
    'timeline', pg_temp.cai_text(coalesce(i->'timeline', i->'schedule')),
    'teamSize', coalesce(
      nullif(pg_temp.cai_text(coalesce(i->'teamSize', i->'team_size', i->'resources')), ''),
      pg_temp.cai_text(operating_model->'core_team')
    ),
    'dependencies', coalesce(
      nullif(pg_temp.cai_text(i->'dependencies'), ''),
      nullif(pg_temp.cai_text(scope->'dependencies'), ''),
      pg_temp.cai_text(operating_model->'partners')
    ),
    'assumptions', pg_temp.cai_text(i->'assumptions'),
    'constraints', coalesce(
      nullif(pg_temp.cai_text(coalesce(i->'constraints', i->'exclusions')), ''),
      pg_temp.cai_text(scope->'constraints')
    ),
    'successFactors', pg_temp.cai_text(coalesce(
      i->'successFactors', i->'success_factors', i->'success_criteria', i->'success_metrics'
    )),
    'knownRisks', pg_temp.cai_text(coalesce(i->'knownRisks', i->'known_risks', i->'risks')),
    'regulatoryConsiderations', pg_temp.cai_text(coalesce(
      i->'regulatoryConsiderations', i->'regulatory_considerations',
      i->'regulatory', i->'standards_and_methods'
    )),
    'technologyReadiness', pg_temp.cai_text(coalesce(
      i->'technologyReadiness', i->'technology_readiness', i->'technical_readiness'
    )),
    'competitorUrls', pg_temp.cai_text(coalesce(i->'competitorUrls', i->'competitor_urls'))
  );

  warnings := pg_temp.cai_strings(coalesce(o->'evidenceWarnings', o->'evidence_warnings', '[]'::jsonb));

  market_source := CASE WHEN jsonb_typeof(o->'market') = 'object' THEN o->'market' ELSE '{}'::jsonb END;
  growth_source := coalesce(market_source->'growthChart', market_source->'growth_chart', '[]'::jsonb);
  IF jsonb_typeof(growth_source) = 'array' THEN
    FOR item IN SELECT element FROM jsonb_array_elements(growth_source) AS rows(element)
    LOOP
      growth_chart := growth_chart || jsonb_build_array(jsonb_build_object(
        'year', pg_temp.cai_text(item->'year'),
        'tam', greatest(0, coalesce(pg_temp.cai_num(item->'tam'), 0)),
        'sam', greatest(0, coalesce(pg_temp.cai_num(item->'sam'), 0))
      ));
    END LOOP;
  END IF;
  market := jsonb_build_object(
    'tamLabel', pg_temp.cai_text(coalesce(market_source->'tamLabel', market_source->'tam_label')),
    'tamValue', pg_temp.cai_text(coalesce(market_source->'tamValue', market_source->'tam_value', market_source->'tam')),
    'tamCagr', pg_temp.cai_text(coalesce(market_source->'tamCagr', market_source->'tam_cagr', market_source->'cagr')),
    'samLabel', pg_temp.cai_text(coalesce(market_source->'samLabel', market_source->'sam_label')),
    'samValue', pg_temp.cai_text(coalesce(market_source->'samValue', market_source->'sam_value', market_source->'sam')),
    'samCagr', pg_temp.cai_text(coalesce(market_source->'samCagr', market_source->'sam_cagr', market_source->'cagr')),
    'somLabel', pg_temp.cai_text(coalesce(market_source->'somLabel', market_source->'som_label')),
    'somValue', pg_temp.cai_text(coalesce(market_source->'somValue', market_source->'som_value', market_source->'som')),
    'somCagr', pg_temp.cai_text(coalesce(market_source->'somCagr', market_source->'som_cagr', market_source->'cagr')),
    'growthChart', growth_chart,
    'currency', pg_temp.cai_text(market_source->'currency')
  );
  IF pg_temp.cai_text(market->'tamValue') = '' OR pg_temp.cai_text(market->'samValue') = ''
    OR pg_temp.cai_text(market->'somValue') = '' THEN
    warnings := warnings || jsonb_build_array(
      'Market sizing is incomplete; unavailable values are shown as empty.'
    );
  END IF;

  customer_source := CASE WHEN jsonb_typeof(o->'customer') = 'object' THEN o->'customer' ELSE '{}'::jsonb END;
  customer := jsonb_build_object(
    'ageLocation', pg_temp.cai_text(coalesce(customer_source->'ageLocation', customer_source->'age_location', customer_source->'segment', customer_source->'profile')),
    'income', pg_temp.cai_text(coalesce(customer_source->'income', customer_source->'budget')),
    'goals', pg_temp.cai_text(coalesce(customer_source->'goals', customer_source->'needs')),
    'willingnessToPay', pg_temp.cai_text(coalesce(customer_source->'willingnessToPay', customer_source->'willingness_to_pay')),
    'behavior', pg_temp.cai_text(coalesce(customer_source->'behavior', customer_source->'behaviour'))
  );
  IF customer_source = '{}'::jsonb THEN
    warnings := warnings || jsonb_build_array(
      'Customer profile evidence was not supplied by the external analysis.'
    );
  END IF;

  competitor_source := coalesce(o->'competitors', market_source->'competitors', '[]'::jsonb);
  IF jsonb_typeof(competitor_source) = 'array' THEN
    FOR item IN SELECT element FROM jsonb_array_elements(competitor_source) AS rows(element)
    LOOP
      category := pg_temp.cai_text(coalesce(item->'model', item->'business_model', item->'positioning', item->'category'));
      signal_text := pg_temp.cai_text(coalesce(item->'strengths', item->'strength'));
      competitors := competitors || jsonb_build_array(jsonb_build_object(
        'name', pg_temp.cai_text(coalesce(item->'name', item->'title')),
        'model', CASE
          WHEN category <> '' AND signal_text <> '' THEN category || ' — Strengths: ' || signal_text
          ELSE coalesce(nullif(category, ''), signal_text)
        END,
        'weakness', pg_temp.cai_text(coalesce(item->'weakness', item->'weaknesses', item->'gap')),
        'edge', pg_temp.cai_text(coalesce(
          item->'edge', item->'advantage', item->'differentiator', item->'gap_or_opening'
        ))
      ));
    END LOOP;
  ELSE
    warnings := warnings || jsonb_build_array(
      'Competitor evidence was not supplied by the external analysis.'
    );
  END IF;

  financial_source := CASE WHEN jsonb_typeof(o->'financials') = 'object' THEN o->'financials' ELSE '{}'::jsonb END;
  capex_source := coalesce(financial_source->'capEx', financial_source->'capex', financial_source->'cap_ex', '[]'::jsonb);
  IF jsonb_typeof(capex_source) = 'array' THEN
    FOR item IN SELECT element FROM jsonb_array_elements(capex_source) AS rows(element)
    LOOP
      category := pg_temp.cai_text(coalesce(item->'category', item->'item', item->'name', item->'title'));
      IF category = '' OR position('total' IN lower(category)) > 0 THEN CONTINUE; END IF;
      amount := greatest(0, coalesce(pg_temp.cai_num(coalesce(item->'amount', item->'value')), 0));
      low_value := greatest(0, coalesce(pg_temp.cai_num(coalesce(item->'low', item->'min', item->'minimum')), amount));
      high_value := greatest(0, coalesce(pg_temp.cai_num(coalesce(item->'high', item->'max', item->'maximum')), amount));
      capex := capex || jsonb_build_array(jsonb_build_object(
        'category', category,
        'low', least(low_value, high_value),
        'high', greatest(low_value, high_value),
        'notes', pg_temp.cai_text(coalesce(item->'notes', item->'note', item->'description'))
      ));
      capex_low := capex_low + least(low_value, high_value);
      capex_high := capex_high + greatest(low_value, high_value);
    END LOOP;
  END IF;
  capex_mid := round((capex_low + capex_high) / 2, 2);

  opex_source := coalesce(financial_source->'opEx', financial_source->'opex', financial_source->'op_ex', '[]'::jsonb);
  IF jsonb_typeof(opex_source) = 'array' THEN
    FOR item IN SELECT element FROM jsonb_array_elements(opex_source) AS rows(element)
    LOOP
      category := pg_temp.cai_text(coalesce(item->'category', item->'item', item->'name', item->'title'));
      row_year := pg_temp.cai_num(item->'year');
      IF category = '' OR position('total' IN lower(category)) > 0
        OR (row_year IS NOT NULL AND row_year <> 1) THEN CONTINUE; END IF;
      annual_value := greatest(0, coalesce(pg_temp.cai_num(coalesce(
        item->'annual', item->'annual_amount', item->'amount', item->'year1', item->'year_1'
      )), 0));
      monthly_value := greatest(0, coalesce(
        pg_temp.cai_num(coalesce(item->'monthly', item->'monthly_amount')),
        CASE WHEN annual_value > 0 THEN annual_value / 12 ELSE 0 END
      ));
      IF annual_value = 0 AND monthly_value > 0 THEN annual_value := monthly_value * 12; END IF;
      opex := opex || jsonb_build_array(jsonb_build_object(
        'category', category,
        'monthly', round(monthly_value, 2),
        'annual', round(annual_value, 2)
      ));
    END LOOP;
  END IF;

  scenario_source := coalesce(financial_source->'scenarios', financial_source->'revenue', '[]'::jsonb);
  IF jsonb_typeof(scenario_source) = 'array' THEN
    FOR item IN SELECT element FROM jsonb_array_elements(scenario_source) AS rows(element)
    LOOP
      category := lower(pg_temp.cai_text(coalesce(item->'scenario', item->'name', item->'case')));
      scenarios := scenarios || jsonb_build_array(jsonb_build_object(
        'scenario', CASE
          WHEN category ~ '(optim|upside|best)' THEN 'Optimistic'
          WHEN category ~ '(pess|downside|worst)' THEN 'Pessimistic'
          ELSE 'Base Case'
        END,
        'probability', pg_temp.cai_text(coalesce(item->'probability', item->'probability_pct')),
        'subscribersYr1', pg_temp.cai_text(coalesce(item->'subscribersYr1', item->'subscribers_yr1', item->'units', item->'customers')),
        'annualRevenue', CASE
          WHEN jsonb_typeof(coalesce(
            item->'annualRevenue', item->'annual_revenue', item->'revenue', item->'year_3_revenue'
          )) = 'number'
            AND pg_temp.cai_text(financial_source->'currency') <> ''
          THEN pg_temp.cai_text(financial_source->'currency') || ' '
            || pg_temp.cai_text(coalesce(
              item->'annualRevenue', item->'annual_revenue', item->'revenue', item->'year_3_revenue'
            ))
          ELSE pg_temp.cai_text(coalesce(
            item->'annualRevenue', item->'annual_revenue', item->'revenue', item->'year_3_revenue'
          ))
        END,
        'breakEven', pg_temp.cai_text(coalesce(
          item->'breakEven',
          item->'break_even',
          item->'estimated_cumulative_cash_break_even',
          item->'estimated_operating_break_even',
          item->'estimated_cumulative_break_even'
        ))
      ));
    END LOOP;
  END IF;
  IF jsonb_array_length(capex) = 0 OR jsonb_array_length(opex) = 0
    OR jsonb_array_length(scenarios) = 0 THEN
    warnings := warnings || jsonb_build_array(
      'Financial detail is incomplete; unavailable rows are shown as empty.'
    );
  END IF;
  investment_range := pg_temp.cai_text(coalesce(
    financial_source->'investmentRange',
    financial_source->'investment_range'
  ));
  IF investment_range = '' AND jsonb_array_length(capex) > 0 THEN
    investment_range := capex_low::text || '–' || capex_high::text
      || CASE WHEN pg_temp.cai_text(financial_source->'currency') <> ''
        THEN ' ' || pg_temp.cai_text(financial_source->'currency') ELSE '' END;
  END IF;
  break_even_summary := pg_temp.cai_text(coalesce(
    financial_source->'breakEvenSummary',
    financial_source->'break_even_summary'
  ));
  IF break_even_summary = '' AND pg_temp.cai_num(financial_source->'break_even_months') IS NOT NULL THEN
    break_even_summary := 'Month ' || pg_temp.cai_num(financial_source->'break_even_months')::text;
  END IF;
  financials := jsonb_build_object(
    'currency', pg_temp.cai_text(financial_source->'currency'),
    'capExTotal', jsonb_build_object('low', capex_low, 'high', capex_high, 'mid', capex_mid),
    'capEx', capex,
    'opEx', opex,
    'scenarios', scenarios,
    'investmentRange', investment_range,
    'breakEvenSummary', break_even_summary,
    'ltvCacRatio', pg_temp.cai_text(coalesce(financial_source->'ltvCacRatio', financial_source->'ltv_cac_ratio'))
  );

  IF jsonb_typeof(o->'risks') = 'array' THEN
    FOR item IN SELECT element FROM jsonb_array_elements(o->'risks') AS rows(element)
    LOOP
      risks := risks || jsonb_build_array(jsonb_build_object(
        'name', pg_temp.cai_text(coalesce(item->'name', item->'title', item->'risk')),
        'probability', pg_temp.cai_level(coalesce(item->'probability', item->'likelihood')),
        'impact', pg_temp.cai_level(coalesce(item->'impact', item->'severity', item->'level')),
        'level', pg_temp.cai_level(coalesce(item->'level', item->'severity', item->'impact')),
        'mitigation', pg_temp.cai_text(coalesce(item->'mitigation', item->'response', item->'treatment'))
      ));
    END LOOP;
  ELSE
    warnings := warnings || jsonb_build_array(
      'Risk register details were not supplied by the external analysis.'
    );
  END IF;

  claims_source := coalesce(o->'claims', '[]'::jsonb);
  IF jsonb_typeof(claims_source) = 'array' AND jsonb_array_length(claims_source) > 0 THEN
    claim_count := jsonb_array_length(claims_source);
    FOR item IN SELECT element FROM jsonb_array_elements(claims_source) AS rows(element)
    LOOP
      signal_text := pg_temp.cai_text(coalesce(item->'text', item->'claim'));
      IF signal_text <> '' THEN web_signals := web_signals || jsonb_build_array(signal_text); END IF;
      IF lower(pg_temp.cai_text(item->'confidence')) = 'high' THEN
        high_claim_count := high_claim_count + 1;
      END IF;
      IF jsonb_typeof(item->'sources') = 'array' THEN
        FOR source_item IN
          SELECT element FROM jsonb_array_elements(item->'sources') AS sources(element)
        LOOP
          citation_url := pg_temp.cai_text(source_item->'url');
          IF citation_url ~* '^https?://[^[:space:]]+$' THEN
            citations := citations || jsonb_build_array(jsonb_build_object(
              'title', pg_temp.cai_text(source_item->'title'),
              'url', citation_url,
              'source', pg_temp.cai_text(coalesce(source_item->'source', source_item->'domain')),
              'takeaway', signal_text
            ));
          ELSE
            invalid_citation_count := invalid_citation_count + 1;
          END IF;
        END LOOP;
      END IF;
    END LOOP;

    IF invalid_citation_count > 0 THEN
      warnings := warnings || jsonb_build_array(
        invalid_citation_count::text
          || ' evidence citation URL(s) were omitted because they were not HTTP(S).'
      );
    END IF;

    IF jsonb_typeof(market_source->'signals') = 'array' THEN
      FOR item IN SELECT element FROM jsonb_array_elements(market_source->'signals') AS rows(element)
      LOOP
        signal_text := pg_temp.cai_text(coalesce(
          item->'signal', item->'text', item->'title', item->'name'
        ));
        implication_text := pg_temp.cai_text(item->'implication');
        IF signal_text <> '' THEN
          key_signals := key_signals || jsonb_build_array(
            signal_text || CASE WHEN implication_text <> '' THEN ' — ' || implication_text ELSE '' END
          );
        END IF;
      END LOOP;
    END IF;
    IF jsonb_typeof(competitor_source) = 'array' THEN
      FOR item IN SELECT element FROM jsonb_array_elements(competitor_source) AS rows(element)
      LOOP
        IF pg_temp.cai_text(item->'name') <> '' THEN
          competitor_mentions := competitor_mentions || jsonb_build_array(pg_temp.cai_text(item->'name'));
        END IF;
      END LOOP;
    END IF;
    research := jsonb_build_object(
      'overview', 'External analysis supplied ' || claim_count::text
        || CASE WHEN claim_count = 1 THEN ' sourced evidence claim.' ELSE ' sourced evidence claims.' END,
      'confidence', CASE
        WHEN high_claim_count::numeric / claim_count >= 0.7 THEN 'High'
        WHEN high_claim_count::numeric / claim_count >= 0.4 THEN 'Medium'
        ELSE 'Low'
      END,
      'sentiment', 'Mixed',
      'keySignals', key_signals,
      'painPoints', '[]'::jsonb,
      'competitorMentions', competitor_mentions,
      'redditSignals', '[]'::jsonb,
      'webSignals', web_signals,
      'citations', citations
    );
  END IF;

  funding_source := coalesce(o->'fundingMix', o->'funding_mix', '[]'::jsonb);
  IF jsonb_typeof(funding_source) = 'array' THEN
    FOR item IN SELECT element FROM jsonb_array_elements(funding_source) AS rows(element)
    LOOP
      funding_mix := funding_mix || jsonb_build_array(jsonb_build_object(
        'source', pg_temp.cai_text(coalesce(item->'source', item->'name', item->'type')),
        'share', pg_temp.cai_text(coalesce(item->'share', item->'percentage', item->'percent')),
        'amount', pg_temp.cai_text(coalesce(item->'amount', item->'value')),
        'rationale', pg_temp.cai_text(coalesce(item->'rationale', item->'reason', item->'notes'))
      ));
    END LOOP;
  ELSE
    warnings := warnings || jsonb_build_array(
      'Funding mix was not supplied by the external analysis.'
    );
  END IF;

  recommendations := pg_temp.cai_strings(coalesce(o->'recommendations', '[]'::jsonb));
  next_steps := pg_temp.cai_strings(coalesce(o->'nextSteps', o->'next_steps', '[]'::jsonb));
  IF jsonb_array_length(recommendations) = 0 THEN
    warnings := warnings || jsonb_build_array(
      'Recommendations were not supplied by the external analysis.'
    );
  END IF;
  IF jsonb_array_length(next_steps) = 0 THEN
    warnings := warnings || jsonb_build_array(
      'Next steps were not supplied by the external analysis.'
    );
  END IF;

  executive_summary := coalesce(
    nullif(pg_temp.cai_text(coalesce(o->'executiveSummary', o->'executive_summary')), ''),
    nullif(pg_temp.cai_text(verdict_source->'summary'), '')
  );
  IF executive_summary IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'path', 'output.executiveSummary',
        'message', 'Legacy executive summary could not be converted safely'
      ))
    );
  END IF;

  normalized_output := jsonb_build_object(
    'reportId', coalesce(nullif(row_display_id, ''), 'EXTERNAL-REPORT'),
    'dateIssued', to_char(row_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
    'classification', coalesce(nullif(pg_temp.cai_text(o->'classification'), ''), 'Confidential'),
    'preparedBy', coalesce(nullif(pg_temp.cai_text(coalesce(o->'preparedBy', o->'prepared_by')), ''), 'Concept AI External Analysis'),
    'methodology', coalesce(nullif(pg_temp.cai_text(o->'methodology'), ''), 'FMART-O 6-Dimension Weighted Scoring'),
    'executiveSummary', executive_summary,
    'scores', scores,
    'market', market,
    'customer', customer,
    'competitors', competitors,
    'financials', financials,
    'risks', risks,
    'fundingMix', funding_mix,
    'fundingAdvisory', pg_temp.cai_text(coalesce(o->'fundingAdvisory', o->'funding_advisory')),
    'recommendations', recommendations,
    'nextSteps', next_steps,
    'evidenceWarnings', warnings
  );

  IF research IS NOT NULL THEN
    normalized_output := jsonb_set(normalized_output, '{research}', research, true);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'inputs', normalized_inputs,
    'output', normalized_output,
    'warnings', warnings
  );
END;
$$;

-- Keep updated_at unchanged while repairing the JSON in place. The table lock
-- taken by ALTER TABLE prevents concurrent report writes from bypassing the
-- trigger during this transaction.
ALTER TABLE public.reports DISABLE TRIGGER trg_reports_updated;

-- Legacy rows may have been incorrectly marked canonical by the original MCP
-- implementation. Reset only rows carrying legacy aliases before re-validating.
UPDATE public.reports
SET canonical_validated = false
WHERE source_mode = 'external_agent'
  AND (
    NOT (output ? 'scores')
    OR output ? 'fmarto_scores'
    OR output ? 'fmarto'
    OR output ? 'next_steps'
    OR output ? 'executive_summary'
    OR output ? 'funding_mix'
    OR output ? 'funding_advisory'
  );

WITH legacy AS (
  SELECT
    r.id,
    r.inputs AS old_inputs,
    r.output AS old_output,
    pg_temp.cai_external_report(
      r.inputs,
      r.output,
      r.title,
      r.industry,
      r.display_id,
      r.created_at
    ) AS normalized
  FROM public.reports r
  WHERE r.source_mode = 'external_agent'
    AND (
      NOT (r.output ? 'scores')
      OR r.output ? 'fmarto_scores'
      OR r.output ? 'fmarto'
      OR r.output ? 'next_steps'
      OR r.output ? 'executive_summary'
      OR r.output ? 'funding_mix'
      OR r.output ? 'funding_advisory'
    )
),
repairable AS (
  SELECT * FROM legacy WHERE normalized->>'valid' = 'true'
)
UPDATE public.reports AS r
SET
  inputs = repairable.normalized->'inputs',
  output = repairable.normalized->'output',
  external_agent_metadata = (
    coalesce(r.external_agent_metadata, '{}'::jsonb)
    || CASE WHEN jsonb_typeof(repairable.old_output->'agent_metadata') = 'object'
      THEN repairable.old_output->'agent_metadata' ELSE '{}'::jsonb END
    || jsonb_build_object(
      'canonical_schema_version', 'feasibility-report.v1',
      'backfilled_at', now(),
      'normalization_warnings', repairable.normalized->'warnings'
    )
  ) || CASE
    WHEN coalesce(r.external_agent_metadata, '{}'::jsonb) ? 'legacy_snapshot' THEN '{}'::jsonb
    ELSE jsonb_build_object(
      'legacy_snapshot',
      jsonb_build_object('inputs', repairable.old_inputs, 'output', repairable.old_output)
    )
  END,
  canonical_validated = true
FROM repairable
WHERE r.id = repairable.id;

-- Unsafe legacy rows are retained unchanged and made visible to operators as
-- repair errors; they are never marked canonical or silently padded with scores.
WITH legacy AS (
  SELECT
    r.id,
    pg_temp.cai_external_report(
      r.inputs,
      r.output,
      r.title,
      r.industry,
      r.display_id,
      r.created_at
    ) AS normalized
  FROM public.reports r
  WHERE r.source_mode = 'external_agent'
    AND NOT r.canonical_validated
)
UPDATE public.reports AS r
SET external_agent_metadata = coalesce(r.external_agent_metadata, '{}'::jsonb)
  || jsonb_build_object(
    'canonical_repair_failed_at', now(),
    'canonical_repair_errors', legacy.normalized->'issues'
  )
FROM legacy
WHERE r.id = legacy.id
  AND legacy.normalized->>'valid' = 'false';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.reports
    WHERE display_id = 'CAI-2026-00000094'
      AND source_mode = 'external_agent'
      AND NOT canonical_validated
  ) THEN
    RAISE EXCEPTION
      'CAI-2026-00000094 could not be canonicalized safely; inspect external_agent_metadata.canonical_repair_errors';
  END IF;
END;
$$;

ALTER TABLE public.reports ENABLE TRIGGER trg_reports_updated;

-- Lightweight database invariant: a row marked canonical must contain every
-- dashboard-critical object/array. Full field-level rules remain in the shared
-- TypeScript/Zod contract used by all MCP writes and clients.
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_external_canonical_shape,
  ADD CONSTRAINT reports_external_canonical_shape CHECK (
    source_mode <> 'external_agent'
    OR canonical_validated = false
    OR (
      coalesce(jsonb_typeof(inputs) = 'object', false)
      AND coalesce(jsonb_typeof(output) = 'object', false)
      AND coalesce(jsonb_typeof(output->'scores') = 'object', false)
      AND coalesce(jsonb_typeof(output->'market') = 'object', false)
      AND coalesce(jsonb_typeof(output->'customer') = 'object', false)
      AND coalesce(jsonb_typeof(output->'financials') = 'object', false)
      AND coalesce(jsonb_typeof(output->'risks') = 'array', false)
      AND coalesce(jsonb_typeof(output->'fundingMix') = 'array', false)
      AND coalesce(jsonb_typeof(output->'competitors') = 'array', false)
      AND coalesce(jsonb_typeof(output->'recommendations') = 'array', false)
      AND coalesce(jsonb_typeof(output->'nextSteps') = 'array', false)
    )
  ) NOT VALID;

ALTER TABLE public.reports VALIDATE CONSTRAINT reports_external_canonical_shape;

-- The export MCP tool first queries only this bounded preflight result. The
-- SECURITY INVOKER function retains report RLS and avoids loading an arbitrarily
-- large JSONB payload into the Edge runtime before enforcing its export cap.
CREATE OR REPLACE FUNCTION public.get_report_export_preflight(_report_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  slug text,
  is_public boolean,
  source_mode text,
  canonical_validated boolean,
  payload_bytes bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.user_id,
    r.slug,
    r.is_public,
    r.source_mode,
    r.canonical_validated,
    (
      octet_length(r.inputs::text)::bigint
      + octet_length(r.output::text)::bigint
    ) AS payload_bytes
  FROM public.reports AS r
  WHERE r.id = _report_id
$$;

REVOKE ALL ON FUNCTION public.get_report_export_preflight(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_export_preflight(uuid) TO authenticated;

COMMIT;
