import { NextResponse } from "next/server";

// One-time DDL setup. Protected by secret token.
// GET /api/setup-db?secret=elk-setup-2026
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== "elk-setup-2026") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url) return NextResponse.json({ error: "SUPABASE_URL not configured" }, { status: 503 });
  if (!serviceKey) {
    return NextResponse.json({
      error: "SUPABASE_SERVICE_ROLE_KEY not configured in Vercel",
      fix: "Go to Vercel Dashboard → eliozelk project → Settings → Environment Variables → Add SUPABASE_SERVICE_ROLE_KEY",
    }, { status: 503 });
  }

  const ref = url.replace("https://", "").replace(".supabase.co", "");
  const pgMetaUrl = `https://${ref}.supabase.co/pg_meta/v1/query`;

  async function runSQL(sql: string): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(pgMetaUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: body };
    }
    return { ok: true };
  }

  const steps: Array<{ name: string; sql: string }> = [
    {
      name: "handle_updated_at function",
      sql: `create or replace function public.handle_updated_at()
        returns trigger language plpgsql as $$
        begin new.updated_at = now(); return new; end; $$`,
    },
    {
      name: "customers table",
      sql: `create table if not exists public.customers (
        id text primary key, name text not null, location text not null default '',
        phone text not null default '', last_order text not null default '',
        notes text, payment_terms text,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now())`,
    },
    { name: "customers RLS", sql: `alter table public.customers enable row level security` },
    { name: "customers policy", sql: `do $$ begin
        if not exists (select 1 from pg_policies where tablename='customers' and policyname='anon_all_customers') then
          create policy "anon_all_customers" on customers for all using (true) with check (true);
        end if; end $$` },

    {
      name: "catalog_items table",
      sql: `create table if not exists public.catalog_items (
        id text primary key, name text not null, type text not null,
        category text not null default '', unit_of_measure text not null,
        dimension_value text, dimension_unit text, default_price numeric,
        description text not null default '', is_active boolean not null default true,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now())`,
    },
    { name: "catalog_items RLS", sql: `alter table public.catalog_items enable row level security` },
    { name: "catalog_items policy", sql: `do $$ begin
        if not exists (select 1 from pg_policies where tablename='catalog_items' and policyname='anon_all_catalog') then
          create policy "anon_all_catalog" on catalog_items for all using (true) with check (true);
        end if; end $$` },

    {
      name: "crews table",
      sql: `create table if not exists public.crews (
        id text primary key, name text not null, leader text not null default '',
        worker_count integer not null default 1, phone text not null default '',
        skills text[] not null default '{}', region text not null default 'all',
        daily_capacity_hours numeric not null default 8, active boolean not null default true,
        notes text not null default '',
        created_at timestamptz not null default now(), updated_at timestamptz not null default now())`,
    },
    { name: "crews RLS", sql: `alter table public.crews enable row level security` },
    { name: "crews policy", sql: `do $$ begin
        if not exists (select 1 from pg_policies where tablename='crews' and policyname='anon_all_crews') then
          create policy "anon_all_crews" on crews for all using (true) with check (true);
        end if; end $$` },

    {
      name: "work_orders table",
      sql: `create table if not exists public.work_orders (
        id text primary key, order_number text not null,
        status text not null default 'graphics_pending', priority text not null default 'normal',
        customer text not null default '', city text not null default '',
        order_date text not null default '', data jsonb not null default '{}',
        created_at timestamptz not null default now(), updated_at timestamptz not null default now())`,
    },
    { name: "work_orders RLS", sql: `alter table public.work_orders enable row level security` },
    { name: "work_orders policy", sql: `do $$ begin
        if not exists (select 1 from pg_policies where tablename='work_orders' and policyname='anon_all_orders') then
          create policy "anon_all_orders" on work_orders for all using (true) with check (true);
        end if; end $$` },

    {
      name: "work_diaries table",
      sql: `create table if not exists public.work_diaries (
        id text primary key, diary_number text not null,
        status text not null default 'draft', customer_name text not null default '',
        site_name text not null default '', execution_date text not null default '',
        submitted_at timestamptz, data jsonb not null default '{}',
        created_at timestamptz not null default now(), updated_at timestamptz not null default now())`,
    },
    { name: "work_diaries RLS", sql: `alter table public.work_diaries enable row level security` },
    { name: "work_diaries policy", sql: `do $$ begin
        if not exists (select 1 from pg_policies where tablename='work_diaries' and policyname='anon_all_diaries') then
          create policy "anon_all_diaries" on work_diaries for all using (true) with check (true);
        end if; end $$` },

    {
      name: "cost_rates table",
      sql: `create table if not exists public.cost_rates (
        id integer primary key default 1, data jsonb not null default '{}',
        updated_at timestamptz not null default now(),
        constraint single_row check (id = 1))`,
    },
    { name: "cost_rates RLS", sql: `alter table public.cost_rates enable row level security` },
    { name: "cost_rates policy", sql: `do $$ begin
        if not exists (select 1 from pg_policies where tablename='cost_rates' and policyname='anon_all_rates') then
          create policy "anon_all_rates" on cost_rates for all using (true) with check (true);
        end if; end $$` },
    { name: "cost_rates seed row", sql: `insert into public.cost_rates (id, data) values (1, '{}') on conflict (id) do nothing` },
  ];

  const results: Record<string, string> = {};
  let allOk = true;
  for (const step of steps) {
    const r = await runSQL(step.sql);
    results[step.name] = r.ok ? "✓" : `✗ ${r.error ?? ""}`;
    if (!r.ok) allOk = false;
  }

  return NextResponse.json({ ok: allOk, results });
}
