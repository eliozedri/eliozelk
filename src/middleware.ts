import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/setup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // A Supabase session lives in cookies named `sb-<ref>-auth-token` (possibly
  // chunked `.0`, `.1`). Their presence means the browser HAS a session.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  // No cookie at all → genuinely unauthenticated → redirect.
  if (!hasAuthCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Validate the session. getUser() hits the auth server and may refresh an
  // expired access token (writing fresh cookies via setAll above).
  const { data: { user }, error } = await supabase.auth.getUser();

  if (user) {
    return response; // valid — carries any refreshed cookies
  }

  // Cookie present but getUser returned no user. This is the dangerous case
  // that used to nuke every session on iPad: it happens not only for truly
  // revoked sessions but ALSO for transient failures — a refresh-token rotation
  // race (the browser client already refreshed, this server attempt hits the
  // now-used token), a network blip, or Safari resuming a suspended tab. We do
  // NOT redirect here. The request proceeds; the data layer (RLS on every query
  // + bearer-token checks on every /api route) still denies anything a broken
  // session shouldn't see, and the client AuthContext owns the genuine-logout
  // path once it confirms the session is actually gone. This trades a momentary
  // shell render for never falsely ejecting a logged-in user.
  if (error) {
    console.warn("[middleware] getUser failed but auth cookie present — allowing through:", error.message);
  }
  return response;
}

export const config = {
  matcher: [
    // Auth-gate everything except Next internals, the API (self-guarded), the
    // public PWA assets the browser must fetch without a session (service worker,
    // web manifest, app icons), and jarvis/ — public images WhatsApp fetches by URL
    // (owner dictation help + Elkayam logo). Otherwise those fetches 307→/login.
    "/((?!_next/static|_next/image|favicon.ico|api/|sw.js|manifest.webmanifest|icon-192.png|icon-512.png|jarvis/).*)",
  ],
};
