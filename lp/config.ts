export function resolvePublicUrl(value: unknown, currentHref: string, currentOrigin: string): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value, currentHref);
    if (url.origin === currentOrigin || url.protocol === "https:") return url.href;
  } catch {
    return null;
  }
  return null;
}
