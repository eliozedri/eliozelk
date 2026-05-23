/**
 * Register the Team Bot webhook with Telegram.
 *
 *   npm run team-bot:set-webhook -- https://your-deployment.vercel.app/api/team-bot/webhook
 *
 * Reads TEAM_BOT_TELEGRAM_TOKEN + TEAM_BOT_WEBHOOK_SECRET from .env.local.
 * Never prints the token. Self-contained (no server-only imports) so it runs
 * under tsx. This points Telegram at a PUBLIC url — only run it against a
 * deployment you intend to make live.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const url = process.argv[2];
  if (!url || !/^https:\/\//.test(url)) {
    console.error("Usage: npm run team-bot:set-webhook -- https://<host>/api/team-bot/webhook");
    process.exit(1);
  }
  const token = process.env.TEAM_BOT_TELEGRAM_TOKEN;
  const secret = process.env.TEAM_BOT_WEBHOOK_SECRET;
  if (!token) {
    console.error("TEAM_BOT_TELEGRAM_TOKEN missing in .env.local");
    process.exit(1);
  }
  if (!secret) {
    console.error("TEAM_BOT_WEBHOOK_SECRET missing in .env.local (generate: openssl rand -hex 32)");
    process.exit(1);
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    }),
  });
  const json = (await res.json()) as { ok?: boolean; description?: string };
  if (json.ok) {
    console.log(`✅ Webhook set → ${url}`);
  } else {
    console.error(`❌ setWebhook failed: ${json.description ?? res.status}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("set-webhook error:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
