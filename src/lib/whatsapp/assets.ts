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

/**
 * Pre-filled "click to chat" link for EXTERNAL customers. Opens WhatsApp to the Jarvis
 * business number with the starter message ready; the customer just presses Send and the
 * external order-intake wizard begins. (Owner uses their own phone — not this link.)
 */
export const JARVIS_WA_NUMBER = "972508588241";
export const JARVIS_CUSTOMER_STARTER = "שלום ג׳ארוויס, אני רוצה לפתוח בקשת הזמנה";
export const JARVIS_CUSTOMER_LINK = `https://wa.me/${JARVIS_WA_NUMBER}?text=${encodeURIComponent(JARVIS_CUSTOMER_STARTER)}`;
