/**
 * Remove the Team Bot webhook from Telegram (disables inbound updates).
 *   npm run team-bot:delete-webhook
 * Reads TEAM_BOT_TELEGRAM_TOKEN from .env.local. Never prints the token.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const token = process.env.TEAM_BOT_TELEGRAM_TOKEN;
  if (!token) {
    console.error("TEAM_BOT_TELEGRAM_TOKEN missing in .env.local");
    process.exit(1);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: false }),
  });
  const json = (await res.json()) as { ok?: boolean; description?: string };
  if (json.ok) console.log("✅ Webhook deleted.");
  else {
    console.error(`❌ deleteWebhook failed: ${json.description ?? res.status}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("delete-webhook error:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
