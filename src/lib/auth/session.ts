const SESSION_KEY = "elkayam_session";
const COOKIE_NAME = "elkayam_session";

export interface SessionData {
  userId: string;
  createdAt: number;
}

function setCookie(value: string) {
  document.cookie = `${COOKIE_NAME}=${value}; path=/; SameSite=Lax; max-age=86400`;
}

function clearCookie() {
  document.cookie = `${COOKIE_NAME}=; path=/; SameSite=Lax; max-age=0`;
}

export function createSession(userId: string): void {
  const session: SessionData = { userId, createdAt: Date.now() };
  const encoded = btoa(JSON.stringify(session));
  localStorage.setItem(SESSION_KEY, encoded);
  setCookie(encoded);
}

export function getSession(): SessionData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(atob(raw)) as SessionData;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  clearCookie();
}
