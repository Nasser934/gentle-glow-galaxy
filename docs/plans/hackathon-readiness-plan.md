# Hackathon-readiness implementation plan

1. Record the base commit and baseline failures.
2. Add failing tests for shared parsing, scoring, confidence, evidence, financial validation, input validation, simulation, canonical exports, demo consistency, wording, and slugs.
3. Implement pure shared analysis modules and make tests pass.
4. Normalize the Edge Function response before returning it; add safe metadata, persistent usage control, idempotency, and bounded logging.
5. Replace the demo with a consistent synthetic internal-project case.
6. Route charts, Decision Room, comparisons, shared reports, PDF, PowerPoint, and Excel through the canonical report.
7. Add an explicit share/revoke dialog and owner-only visibility update path.
8. Replace heuristic claim/source matching with stable mappings and truthful evidence wording.
9. Add loading/error boundaries and recoverable route states.
10. Add one reversible migration for safe slugs, report/audit identifiers, generation controls, RLS, grants, constraints, and indexes.
11. Add pgTAP policy tests and mocked client integration flows.
12. Update current-vs-planned product wording in the README and UI.
13. Add CI and a separate `typecheck` script.
14. Run clean install, lint, type checking, all tests, and production build.
15. Perform a final security/diff review, commit the feature branch, push it, open a PR, merge to the Lovable-active branch, and verify the GitHub/Lovable synchronization signal available to this session.
