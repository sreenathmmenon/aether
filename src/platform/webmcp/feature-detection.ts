export type WebMcpAvailability = {
  available: boolean;
  reason: string | null;
};

export function getWebMcpAvailability(): WebMcpAvailability {
  if (typeof document === "undefined")
    return { available: false, reason: "No document context" };
  return "modelContext" in document
    ? { available: true, reason: null }
    : { available: false, reason: "WebMCP is not enabled in this browser" };
}
