/**
 * Mint a one-time ADMIN access code for the Team Bot.
 *   npm run team-bot:bootstrap-admin
 *
 * Generates a human-typeable code, stores ONLY its SHA-256 hash in
 * team_bot_access_codes (role_to_assign='admin', single-use, 7-day expiry),
 * and prints the plaintext ONCE. The code is meant to be shared with the
 * first admin — it is single-use and expiring, not a long-term secret.
 *
 * The first admin presses Start in the bot and enters this code to become
 * admin; from there they approve other users in-bot.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { createHash, randomInt } from "crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
function generateCode(): string {
  const block = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `ELK-${block()}-${block()}`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const code = generateCode();
  const code_hash = createHash("sha256").update(code, "utf8").digest("hex");
  const expires_at = new Date(Date.now() + 168 * 3600_000).toISOString();

  const { error } = await db.from("team_bot_access_codes").insert({
    code_hash,
    role_to_assign: "admin",
    max_uses: 1,
    used_count: 0,
    expires_at,
    created_by: "bootstrap-script",
    active: true,
  });
  if (error) {
    console.error("Failed to insert access code:", error.message);
    process.exit(1);
  }

  console.log("──────────────────────────────────────────────");
  console.log("  Team Bot — ONE-TIME ADMIN CODE");
  console.log("  Code:    " + code);
  console.log("  Role:    admin");
  console.log("  Uses:    1");
  console.log("  Expires: " + expires_at + " (7 days)");
  console.log("──────────────────────────────────────────────");
  console.log("  In Telegram: press Start, then enter this code.");
}

main().catch((e) => {
  console.error("bootstrap-admin error:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
