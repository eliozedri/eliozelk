/**
 * Public URLs for images WhatsApp fetches by link. These live under public/jarvis/
 * which is excluded from the auth middleware so Meta can fetch them without a session.
 */
const BASE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://eliozelk.vercel.app").replace(/\/$/, "");

export const ELKAYAM_LOGO_URL = `${BASE}/jarvis/elkayam-logo.png`;
export const DICTATION_HELP_URLS = [
  `${BASE}/jarvis/help/dictation-keyboard-1.png`,
  `${BASE}/jarvis/help/dictation-keyboard-2.png`,
];
