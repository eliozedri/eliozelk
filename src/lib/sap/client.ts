import type { SapConfig } from "./config";
import { SapAuthError, SapRequestError } from "./config";

const TIMEOUT_MS = 10_000;

export interface SapSession {
  b1Session: string;
  routeId: string;
  baseUrl: string;
}

export async function login(config: SapConfig): Promise<SapSession> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${config.serviceLayerUrl}/Login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        CompanyDB: config.companyDb,
        UserName: config.username,
        Password: config.password,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new SapAuthError(
      `SAP login network error: ${err instanceof Error ? err.message : String(err)}`,
      true,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = (j as { error?: { message?: { value?: string } } })?.error?.message?.value ?? "";
    } catch { /* ignore parse failure */ }
    throw new SapAuthError(`SAP login failed (${res.status}): ${detail || res.statusText}`);
  }

  const cookieHeader = res.headers.get("set-cookie") ?? "";
  const b1Session = extractCookie(cookieHeader, "B1SESSION");
  const routeId = extractCookie(cookieHeader, "ROUTEID");

  if (!b1Session) {
    throw new SapAuthError("SAP login response missing B1SESSION cookie");
  }

  return { b1Session, routeId, baseUrl: config.serviceLayerUrl };
}

export async function logout(session: SapSession): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fetch(`${session.baseUrl}/Logout`, {
      method: "POST",
      headers: { Cookie: buildCookieHeader(session) },
      signal: controller.signal,
    });
  } catch {
    // logout is best-effort; SAP sessions expire naturally
  } finally {
    clearTimeout(timer);
  }
}

export async function safeGet<T>(path: string, session: SapSession): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${session.baseUrl}${path}`, {
      method: "GET",
      headers: {
        Cookie: buildCookieHeader(session),
        Prefer: "odata.maxpagesize=50",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    throw new SapRequestError(
      `SAP request network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = (j as { error?: { message?: { value?: string } } })?.error?.message?.value ?? "";
    } catch { /* ignore */ }
    throw new SapRequestError(
      `SAP GET ${path} failed (${res.status}): ${detail || res.statusText}`,
      res.status,
    );
  }

  return res.json() as Promise<T>;
}

function buildCookieHeader(session: SapSession): string {
  const parts = [`B1SESSION=${session.b1Session}`];
  if (session.routeId) parts.push(`ROUTEID=${session.routeId}`);
  return parts.join("; ");
}

function extractCookie(header: string, name: string): string {
  return header.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]+)`, "i"))?.[1]?.trim() ?? "";
}
