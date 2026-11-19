/**
 * Safe JSON response parser that guards against HTML gateway/fallback pages
 * (e.g. `<!DOCTYPE html>...`) and surfaces structured, readable errors.
 */

export async function parseJsonResponse<T = unknown>(
  res: Response,
  context: string = "loading market data"
): Promise<T> {
  const raw = await res.text();
  const trimmed = raw.trim();
  const contentType = (res.headers?.get("content-type") || "").toLowerCase();

  if (!trimmed) {
    if (!res.ok) {
      throw new Error(`Request failed (${res.status}) while ${context}.`);
    }
    throw new Error(`Empty response received while ${context}.`);
  }

  const looksLikeHtml =
    trimmed.startsWith("<") ||
    (contentType.includes("text/html") && !contentType.includes("json"));

  if (looksLikeHtml) {
    throw new Error(
      `Server returned an unexpected HTML page (HTTP ${res.status}) while ${context}. Please retry in a moment.`
    );
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `Invalid JSON response (HTTP ${res.status}) while ${context}.`
    );
  }
}
