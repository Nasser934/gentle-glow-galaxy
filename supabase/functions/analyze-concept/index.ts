// Keep the original production endpoint while delegating to the hardened
// implementation. This avoids requiring the published frontend to discover a
// newly named function before Lovable Cloud has deployed it.
import "../analyze-concept-v2/index.ts";
