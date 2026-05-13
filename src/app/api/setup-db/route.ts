import { NextResponse } from "next/server";
import { Client } from "pg";

// One-time DDL setup via direct Postgres connection.
// GET /api/setup-db?secret=elk-setup-2026
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== "elk-setup-2026") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Vercel Supabase integration provides POSTGRES_URL at runtime
  const connStr =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    (process.env.POSTGRES_HOST && process.env.POSTGRES_PASSWORD
      ? `postgresql://${process.env.POSTGRES_USER ?? "postgres"}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}/${process.env.POSTGRES_DATABASE ?? "postgres"}`
      : null);

  const debug = {
    POSTGRES_URL: !!process.env.POSTGRES_URL,
    POSTGRES_URL_NON_POOLING: !!process.env.POSTGRES_URL_NON_POOLING,
    POSTGRES_HOST: !!process.env.POSTGRES_HOST,
    POSTGRES_PASSWORD: !!process.env.POSTGRES_PASSWORD,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  if (!connStr) {
    return NextResponse.json({ error: "No Postgres connection available", debug }, { status: 503 });
  }

  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
  } catch (e) {
    return NextResponse.json({ error: `Connection failed: ${String(e)}`, debug }, { status: 503 });
  }

  const schema = `
    create or replace function public.handle_updated_at()
    returns trigger language plpgsql as $$
    begin new.updated_at = now(); return new; end; $$;

    create table if not exists public.customers (
      id text primary key, name text not null, location text not null default '',
      phone text not null default '', last_order text not null default '',
      notes text, payment_terms text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    alter table public.customers enable row level security;
    do $$ begin if not exists (select 1 from pg_policies where tablename='customers' and policyname='anon_all_customers')
      then create policy "anon_all_customers" on customers for all using (true) with check (true); end if; end $$;

    create table if not exists public.catalog_items (
      id text primary key, name text not null, type text not null,
      category text not null default '', unit_of_measure text not null,
      dimension_value text, dimension_unit text, default_price numeric,
      description text not null default '', is_active boolean not null default true,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    alter table public.catalog_items enable row level security;
    do $$ begin if not exists (select 1 from pg_policies where tablename='catalog_items' and policyname='anon_all_catalog')
      then create policy "anon_all_catalog" on catalog_items for all using (true) with check (true); end if; end $$;

    create table if not exists public.crews (
      id text primary key, name text not null, leader text not null default '',
      worker_count integer not null default 1, phone text not null default '',
      skills text[] not null default '{}', region text not null default 'all',
      daily_capacity_hours numeric not null default 8, active boolean not null default true,
      notes text not null default '',
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    alter table public.crews enable row level security;
    do $$ begin if not exists (select 1 from pg_policies where tablename='crews' and policyname='anon_all_crews')
      then create policy "anon_all_crews" on crews for all using (true) with check (true); end if; end $$;

    create table if not exists public.work_orders (
      id text primary key, order_number text not null,
      status text not null default 'graphics_pending', priority text not null default 'normal',
      customer text not null default '', city text not null default '',
      order_date text not null default '', data jsonb not null default '{}',
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    alter table public.work_orders enable row level security;
    do $$ begin if not exists (select 1 from pg_policies where tablename='work_orders' and policyname='anon_all_orders')
      then create policy "anon_all_orders" on work_orders for all using (true) with check (true); end if; end $$;

    create table if not exists public.work_diaries (
      id text primary key, diary_number text not null,
      status text not null default 'draft', customer_name text not null default '',
      site_name text not null default '', execution_date text not null default '',
      submitted_at timestamptz, data jsonb not null default '{}',
      created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    alter table public.work_diaries enable row level security;
    do $$ begin if not exists (select 1 from pg_policies where tablename='work_diaries' and policyname='anon_all_diaries')
      then create policy "anon_all_diaries" on work_diaries for all using (true) with check (true); end if; end $$;

    create table if not exists public.cost_rates (
      id integer primary key default 1, data jsonb not null default '{}',
      updated_at timestamptz not null default now(),
      constraint single_row check (id = 1));
    alter table public.cost_rates enable row level security;
    do $$ begin if not exists (select 1 from pg_policies where tablename='cost_rates' and policyname='anon_all_rates')
      then create policy "anon_all_rates" on cost_rates for all using (true) with check (true); end if; end $$;
    insert into public.cost_rates (id, data) values (1, '{}') on conflict (id) do nothing;
  `;

  try {
    await client.query(schema);
    await client.end();
    return NextResponse.json({ ok: true, message: "All tables created successfully." });
  } catch (e) {
    await client.end().catch(() => {});
    return NextResponse.json({ ok: false, error: String(e), debug }, { status: 500 });
  }
}
