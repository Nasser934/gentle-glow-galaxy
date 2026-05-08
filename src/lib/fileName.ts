const RESERVED_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

export function safeFileName(value: string, fallback = "report") {
  const cleaned = value
    .normalize("NFKD")
    .replace(RESERVED_FILENAME_CHARS, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return cleaned || fallback;
}
