export function createUrlSafeSlug(bytes?: Uint8Array): string {
  const source = bytes ?? crypto.getRandomValues(new Uint8Array(18));
  if (source.length < 12 || source.length > 64) {
    throw new Error("Slug entropy must be between 96 and 512 bits");
  }
  return Array.from(source, (value) => value.toString(16).padStart(2, "0")).join("");
}
export function isUrlSafeSlug(slug: unknown): slug is string {
  return typeof slug === "string"
    && /^[A-Za-z0-9_-]{20,128}$/.test(slug)
    && new TextEncoder().encode(slug).length <= 128;
}
