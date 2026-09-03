const rawApiBase =
  (import.meta as ImportMeta & { env?: { VITE_AETHER_API_BASE_URL?: string } })
    .env?.VITE_AETHER_API_BASE_URL ?? "";

function normalizedApiBase() {
  if (!rawApiBase) return "";
  try {
    const url = new URL(rawApiBase);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

const apiBase = normalizedApiBase();

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase}${normalizedPath}`;
}
