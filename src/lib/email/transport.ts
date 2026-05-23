import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let _transport: Transporter | null = null;

export class EmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigError";
  }
}

/**
 * Returns a singleton nodemailer transport. Throws EmailConfigError if any
 * required env var is missing (most commonly EMAIL_PASS in production).
 * Server-only: importing this from a client component fails the build.
 */
export function getEmailTransport(): Transporter {
  if (_transport) return _transport;

  const host = process.env.EMAIL_HOST;
  const port = process.env.EMAIL_PORT;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!pass) throw new EmailConfigError("EMAIL_PASS not configured");
  if (!host) throw new EmailConfigError("EMAIL_HOST not configured");
  if (!port) throw new EmailConfigError("EMAIL_PORT not configured");
  if (!user) throw new EmailConfigError("EMAIL_USER not configured");

  _transport = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: false,
    auth: { user, pass },
  });
  return _transport;
}

export function __resetTransportForTests() {
  _transport = null;
}
