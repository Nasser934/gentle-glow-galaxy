# Concept AI hackathon-readiness design

Base commit: `10f9cea88be7bf9fbb32206088db4f44200b7670`

Working branch: `fix/hackathon-readiness`

## Goal

Concept AI will produce one validated report object whose score, verdict, financial figures, evidence labels, and audit metadata are shared by the owner workspace, public report, comparison, Executive Decision Room, and every export.

The application will distinguish user input, cited sources, calculations, AI inference, mixed claims, unknown provenance, and synthetic demonstration data. Planned enterprise features will be documented separately from current MVP behavior.

## Canonical analysis boundary

Pure TypeScript modules under `supabase/functions/_shared/analysis` are the authoritative boundary. They contain no Deno-only APIs, so both the Edge Function and browser/tests can import the same implementation.

The pipeline is:

1. Validate and normalize the concept brief.
2. Gather and classify research sources.
3. Parse the structured model response.
4. Recalculate FMART-O with validated scores and weights.
5. Apply deterministic confidence caps and verdict governance rules.
6. Validate financial and market figures.
7. Normalize claim provenance and explicit claim-to-source relationships.
8. Produce one canonical report and internal quality metadata.
9. Save and export only the canonical report.

Model-proposed overall score and verdict are audit inputs only. They never control the displayed recommendation.

## Compatibility

Existing report rows remain readable. A compatibility normalizer upgrades old JSON at read/export time without rewriting historical data. New generation and save paths write the current schema version. Additive database columns and URL-safe slug migration preserve existing report IDs and links where already safe.

## Financial models

`projectType` selects one of two simulation models:

- `commercial`: revenue, customer acquisition, conversion, and adoption.
- `internal`: labour cost avoided, productivity benefit, adoption, operating cost, and internal payback.

Unsupported precision is replaced with `Requires validation`; AI estimates are visibly marked as estimates. Currency, numeric value, scale, unit, display text, and validation status are modeled separately when canonical metadata is available.

## Evidence model

Every source has a stable ID, canonical URL, domain, publisher, dates, source type, and quality classification. Every major claim has a stable ID, provenance category, direct supporting source IDs, conflicting source IDs, and support status. The UI does not infer support from keywords or attach arbitrary citations.

The report-level visualization is named **Estimated Evidence Composition** and is explicitly described as a heuristic. Claim percentages are validated to total 100; unsupported or AI-only claims always include AI inference.

## Sharing and security

Sharing is an explicit owner action. The UI reads current visibility, writes `is_public`, waits for the database result, and only then offers/copies the public link. Revocation writes `false`, after which anonymous and non-owner reads are rejected by RLS.

Public viewers are read-only. Owner-only policies cover report edits, visibility, status, deletion, and re-runs. Comment insertion is limited to authenticated users who can read the report. Trigger functions use fixed search paths and restricted execution grants.

Persistent generation controls use database rows keyed by user, function, time window, and an idempotency key. Logs contain operational metadata and hashes, not full briefs or secrets.

## Demonstration mode

The demo is a deterministic internal field-operations case labeled **Illustrative Demo — Synthetic Data** and **Synthetic demonstration — not measured organizational results**. It is held in memory unless the user explicitly saves it. Its financial model uses avoided cost, hours saved, adoption, and internal payback; all figures pass the same validators as live reports.

## Verification

Vitest covers scoring, parsing, financial consistency, evidence/provenance, confidence caps, seeded simulation, input validation, canonical exports, demo consistency, wording, and slug behavior. React integration tests mock authentication and Supabase for owner/public/revoked flows. SQL pgTAP tests cover RLS and database invariants. GitHub Actions runs clean install, lint, type checking, tests, and production build.
