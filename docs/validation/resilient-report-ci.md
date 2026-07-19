# Resilient report validation

The analysis pipeline must always return a complete conservative report when AI output is incomplete, timed out, unavailable, or unsupported by enough evidence. Missing evidence is surfaced as validation warnings rather than blocking report creation.
