/**
 * Temporary scraping proxy — lets the local Python scraper fetch pages
 * through Vercel's outbound IPs when the source IP is blocked.
 * Protected by SCRAPE_FETCH_SECRET env var.
 * Remove this file after asclean scraping is complete.
 */
import { NextRequest, NextResponse } from 'next/server';

const SECRET = process.env.SCRAPE_FETCH_SECRET ?? '';

export async function POST(req: NextRequest) {
  if (!SECRET) {
    return NextResponse.json({ error: 'SCRAPE_FETCH_SECRET not configured' }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body || body.secret !== SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { url, binary } = body as { url: string; binary?: boolean };
  if (!url || !url.startsWith('https://') && !url.startsWith('http://')) {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });

    if (binary) {
      const buf = await upstream.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      return NextResponse.json({
        status: upstream.status,
        content_type: upstream.headers.get('content-type') ?? '',
        data_b64: b64,
      });
    }

    const text = await upstream.text();
    return NextResponse.json({
      status: upstream.status,
      content_type: upstream.headers.get('content-type') ?? '',
      html: text,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
