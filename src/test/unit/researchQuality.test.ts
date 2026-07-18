import { describe, expect, it } from "vitest";
import {
  assessCoverage,
  canonicalizeUrl,
  finalizeCitations,
  isBlockedHostname,
  isPrivateNetworkAddress,
  isPublicResearchUrl,
  qualityForWebDomain,
  stableSourceId,
  type CitationCandidate,
} from "../../../supabase/functions/_shared/analysis/research";

const NOW = Date.parse("2026-07-18T00:00:00Z");

function source(overrides: Partial<CitationCandidate> = {}): CitationCandidate {
  return {
    title: "Official statistics",
    url: "https://stats.gov.sa/market",
    source: "Official statistics",
    takeaway: "Direct market evidence.",
    publicationDate: "2026-01-01",
    sourceType: "Verified market evidence",
    quality: "Government or regulator",
    ...overrides,
  };
}

describe("research quality and SSRF guards", () => {
  it("canonicalizes tracking URLs before deduplication", () => {
    expect(canonicalizeUrl("HTTPS://Example.com/report/?utm_source=x#chart")).toBe("https://example.com/report");
  });

  it("generates stable source IDs from canonical URLs", () => {
    expect(stableSourceId("https://example.com/a")).toBe(stableSourceId("https://example.com/a"));
    expect(stableSourceId("https://example.com/a")).not.toBe(stableSourceId("https://example.com/b"));
  });

  it("deduplicates canonical URLs and caps each publisher domain", () => {
    const citations = finalizeCitations([
      source(),
      source({ url: "https://stats.gov.sa/market?utm_source=test" }),
      source({ title: "Second", url: "https://stats.gov.sa/second" }),
      source({ title: "Third", url: "https://stats.gov.sa/third" }),
    ], { now: NOW });
    expect(citations).toHaveLength(2);
    expect(new Set(citations.map((citation) => citation.url)).size).toBe(2);
  });

  it("ranks official and academic domains above general references", () => {
    expect(qualityForWebDomain("data.gov.sa")).toBe("Government or regulator");
    expect(qualityForWebDomain("research.example.edu")).toBe("Academic or institutional");
    expect(qualityForWebDomain("data.worldbank.org")).toBe("Academic or institutional");
    expect(qualityForWebDomain("example.com")).toBe("General reference");
  });

  it("does not call community-only evidence reliable", () => {
    const citations = finalizeCitations([
      source({
        url: "https://reddit.com/r/example/1",
        sourceType: "Community discussion",
        quality: "Community signal",
      }),
    ], { now: NOW });
    expect(assessCoverage(citations)).toMatchObject({
      coverage: "No reliable external evidence",
      reliableExternalEvidence: false,
    });
  });

  it("requires independent reliable domains for partial coverage", () => {
    const citations = finalizeCitations([
      source(),
      source({ url: "https://university.edu/study", quality: "Academic or institutional" }),
    ], { now: NOW });
    expect(assessCoverage(citations).coverage).toBe("Partial");
  });

  it("flags time-sensitive sources older than two years", () => {
    const [citation] = finalizeCitations([source({ publicationDate: "2020-01-01" })], { now: NOW });
    expect(citation.stale).toBe(true);
    expect(assessCoverage([citation]).coverage).toBe("Limited");
  });

  it.each([
    "127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.2", "192.168.1.1",
    "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1",
  ])("blocks private, link-local, metadata, and mapped address %s", (address) => {
    expect(isPrivateNetworkAddress(address)).toBe(true);
  });

  it("allows an ordinary public address", () => {
    expect(isPrivateNetworkAddress("8.8.8.8")).toBe(false);
    expect(isPrivateNetworkAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("blocks local and cloud metadata hostnames", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("service.internal")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("example.com")).toBe(false);
  });

  it.each([
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "https://metadata.google.internal/computeMetadata/v1",
    "https://user:password@example.com/private",
    "file:///etc/passwd",
  ])("rejects unsafe competitor research URL %s", (url) => {
    expect(isPublicResearchUrl(url)).toBe(false);
  });

  it("allows a public HTTPS competitor research URL", () => {
    expect(isPublicResearchUrl("https://www.example.com/product?ref=brief")).toBe(true);
  });
});
