import "server-only";
import { sendWhatsAppPayload } from "./send";

/**
 * WhatsApp Cloud API interactive + media helpers.
 *
 * WhatsApp has NO message editing/deletion (unlike Telegram), so the wizard sends one
 * compact interactive message per step and keeps state in the backend. Limits enforced
 * here: reply buttons ≤3 (title ≤20), list ≤10 rows (title ≤24, desc ≤72).
 * All return boolean so callers can fall back to plain text.
 */

export interface ReplyButton {
  id: string;
  title: string;
}
export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** Up to 3 reply buttons. */
export async function sendWhatsAppButtons(
  to: string,
  body: string,
  buttons: ReplyButton[],
  footer?: string,
): Promise<boolean> {
  const action = {
    buttons: buttons.slice(0, 3).map((b) => ({
      type: "reply",
      reply: { id: b.id, title: cut(b.title, 20) },
    })),
  };
  return sendWhatsAppPayload(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: cut(body, 1024) },
      ...(footer ? { footer: { text: cut(footer, 60) } } : {}),
      action,
    },
  });
}

/** A single-section list message (up to 10 rows). */
export async function sendWhatsAppList(
  to: string,
  body: string,
  buttonLabel: string,
  rows: ListRow[],
  opts?: { header?: string; footer?: string; sectionTitle?: string },
): Promise<boolean> {
  return sendWhatsAppPayload(to, {
    type: "interactive",
    interactive: {
      type: "list",
      ...(opts?.header ? { header: { type: "text", text: cut(opts.header, 60) } } : {}),
      body: { text: cut(body, 1024) },
      ...(opts?.footer ? { footer: { text: cut(opts.footer, 60) } } : {}),
      action: {
        button: cut(buttonLabel, 20),
        sections: [
          {
            title: cut(opts?.sectionTitle ?? "תפריט", 24),
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: cut(r.title, 24),
              ...(r.description ? { description: cut(r.description, 72) } : {}),
            })),
          },
        ],
      },
    },
  });
}

/** Send an image by public URL (with optional caption). */
export async function sendWhatsAppImage(to: string, link: string, caption?: string): Promise<boolean> {
  return sendWhatsAppPayload(to, {
    type: "image",
    image: { link, ...(caption ? { caption: cut(caption, 1024) } : {}) },
  });
}
