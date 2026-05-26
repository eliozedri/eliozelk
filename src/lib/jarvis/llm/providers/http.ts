import "server-only";

/**
 * Minimal server-side JSON POST with a hard AbortController timeout. Used by all live providers
 * (no SDKs — lightweight fetch). Never logs headers/keys/bodies. Returns a structured result so
 * providers never throw into the router.
 */

export interface HttpResult {
  ok: boolean;
  status: number;
  json?: unknown;
  text?: string;
  error?: string;
}

export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<HttpResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs > 0 ? timeoutMs : 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!res.ok) return { ok: false, status: res.status, error: `http_${res.status}`, json, text };
    return { ok: true, status: res.status, json, text };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, status: 0, error: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(t);
  }
}

/** Provider-specific model override → global override → provider default. */
export function resolveModel(provider: string, fallback: string): string {
  return process.env[`${provider.toUpperCase()}_MODEL`] || process.env.JARVIS_LLM_MODEL || fallback;
}
