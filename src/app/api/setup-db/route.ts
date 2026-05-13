import { NextResponse } from "next/server";
import { Client } from "pg";

// GET /api/setup-db?secret=elk-setup-2026
// Idempotent — safe to run multiple times.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== "elk-setup-2026") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const connStr =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    (process.env.POSTGRES_HOST && process.env.POSTGRES_PASSWORD
      ? `postgresql://${process.env.POSTGRES_USER ?? "postgres"}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}/${process.env.POSTGRES_DATABASE ?? "postgres"}`
      : null);

  if (!connStr) {
    return NextResponse.json({
      error: "No Postgres connection",
      env: {
        POSTGRES_URL: !!process.env.POSTGRES_URL,
        POSTGRES_URL_NON_POOLING: !!process.env.POSTGRES_URL_NON_POOLING,
        POSTGRES_HOST: !!process.env.POSTGRES_HOST,
        POSTGRES_PASSWORD: !!process.env.POSTGRES_PASSWORD,
      },
    }, { status: 503 });
  }

  // Disable TLS cert verification only for this internal setup call
  const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const client = new Client({ connectionString: connStr });

  try {
    await client.connect();
  } catch (e) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
    return NextResponse.json({ error: `Connection failed: ${String(e)}` }, { status: 503 });
  }

  try {
    await client.query(`
      -- ── Trigger helper ────────────────────────────────────────────────────────
      create or replace function public.handle_updated_at()
      returns trigger language plpgsql as $$
      begin new.updated_at = now(); return new; end; $$;

      -- ── Users (cross-device auth) ─────────────────────────────────────────────
      create table if not exists public.users (
        id             text primary key,
        email          text not null,
        name           text not null,
        role           text not null default 'viewer',
        is_active      boolean not null default true,
        allowed_tabs   text[] not null default '{}',
        action_permissions text[] not null default '{}',
        password_hash  text not null,
        last_login_at  timestamptz,
        created_at     timestamptz not null default now(),
        updated_at     timestamptz not null default now()
      );
      alter table public.users enable row level security;
      do $$ begin
        if not exists (select 1 from pg_policies where tablename='users' and policyname='anon_all_users')
        then create policy "anon_all_users" on users for all using (true) with check (true); end if;
      end $$;
      create unique index if not exists users_email_lower_idx on public.users (lower(email));

      do $$ begin
        if not exists (select 1 from pg_trigger where tgname='users_updated_at')
        then create trigger users_updated_at before update on users
          for each row execute function public.handle_updated_at(); end if;
      end $$;

      -- ── Atomic counters (collision-free order/diary numbers) ──────────────────
      create table if not exists public.counters (
        key   text primary key,
        value integer not null default 0
      );
      insert into public.counters (key, value)
        values ('order', 0), ('diary', 0)
        on conflict (key) do nothing;

      create or replace function public.next_counter(counter_key text)
      returns integer language plpgsql security definer as $$
      declare next_val integer;
      begin
        update public.counters set value = value + 1
        where key = counter_key returning value into next_val;
        if next_val is null then
          insert into public.counters (key, value) values (counter_key, 1)
          on conflict (key) do update set value = public.counters.value + 1
          returning value into next_val;
        end if;
        return next_val;
      end; $$;
      grant execute on function public.next_counter(text) to anon, authenticated;

      -- ── Customers ─────────────────────────────────────────────────────────────
      create table if not exists public.customers (
        id            text primary key,
        name          text not null,
        location      text not null default '',
        phone         text not null default '',
        last_order    text not null default '',
        notes         text,
        payment_terms text,
        created_at    timestamptz not null default now(),
        updated_at    timestamptz not null default now()
      );
      alter table public.customers enable row level security;
      do $$ begin
        if not exists (select 1 from pg_policies where tablename='customers' and policyname='anon_all_customers')
        then create policy "anon_all_customers" on customers for all using (true) with check (true); end if;
      end $$;
      do $$ begin
        if not exists (select 1 from pg_trigger where tgname='customers_updated_at')
        then create trigger customers_updated_at before update on customers
          for each row execute function public.handle_updated_at(); end if;
      end $$;
      create index if not exists customers_name_idx on public.customers (name);

      -- ── Catalog Items ─────────────────────────────────────────────────────────
      create table if not exists public.catalog_items (
        id              text primary key,
        name            text not null,
        type            text not null,
        category        text not null default '',
        unit_of_measure text not null,
        dimension_value text,
        dimension_unit  text,
        default_price   numeric,
        description     text not null default '',
        is_active       boolean not null default true,
        created_at      timestamptz not null default now(),
        updated_at      timestamptz not null default now()
      );
      alter table public.catalog_items enable row level security;
      do $$ begin
        if not exists (select 1 from pg_policies where tablename='catalog_items' and policyname='anon_all_catalog')
        then create policy "anon_all_catalog" on catalog_items for all using (true) with check (true); end if;
      end $$;
      do $$ begin
        if not exists (select 1 from pg_trigger where tgname='catalog_items_updated_at')
        then create trigger catalog_items_updated_at before update on catalog_items
          for each row execute function public.handle_updated_at(); end if;
      end $$;
      create index if not exists catalog_items_type_idx on public.catalog_items (type);
      create index if not exists catalog_items_active_idx on public.catalog_items (is_active);

      -- ── Crews ─────────────────────────────────────────────────────────────────
      create table if not exists public.crews (
        id                   text primary key,
        name                 text not null,
        leader               text not null default '',
        worker_count         integer not null default 1,
        phone                text not null default '',
        skills               text[] not null default '{}',
        region               text not null default 'all',
        daily_capacity_hours numeric not null default 8,
        active               boolean not null default true,
        notes                text not null default '',
        created_at           timestamptz not null default now(),
        updated_at           timestamptz not null default now()
      );
      alter table public.crews enable row level security;
      do $$ begin
        if not exists (select 1 from pg_policies where tablename='crews' and policyname='anon_all_crews')
        then create policy "anon_all_crews" on crews for all using (true) with check (true); end if;
      end $$;
      do $$ begin
        if not exists (select 1 from pg_trigger where tgname='crews_updated_at')
        then create trigger crews_updated_at before update on crews
          for each row execute function public.handle_updated_at(); end if;
      end $$;

      -- ── Work Orders ───────────────────────────────────────────────────────────
      create table if not exists public.work_orders (
        id           text primary key,
        order_number text not null,
        status       text not null default 'graphics_pending',
        priority     text not null default 'normal',
        customer     text not null default '',
        city         text not null default '',
        order_date   text not null default '',
        data         jsonb not null default '{}',
        created_at   timestamptz not null default now(),
        updated_at   timestamptz not null default now()
      );
      alter table public.work_orders enable row level security;
      do $$ begin
        if not exists (select 1 from pg_policies where tablename='work_orders' and policyname='anon_all_orders')
        then create policy "anon_all_orders" on work_orders for all using (true) with check (true); end if;
      end $$;
      do $$ begin
        if not exists (select 1 from pg_trigger where tgname='work_orders_updated_at')
        then create trigger work_orders_updated_at before update on work_orders
          for each row execute function public.handle_updated_at(); end if;
      end $$;
      create index if not exists work_orders_status_idx on public.work_orders (status);
      create index if not exists work_orders_customer_idx on public.work_orders (customer);
      create index if not exists work_orders_date_idx on public.work_orders (order_date desc);
      create index if not exists work_orders_updated_idx on public.work_orders (updated_at desc);

      -- ── Work Diaries ──────────────────────────────────────────────────────────
      create table if not exists public.work_diaries (
        id             text primary key,
        diary_number   text not null,
        status         text not null default 'draft',
        customer_name  text not null default '',
        site_name      text not null default '',
        execution_date text not null default '',
        submitted_at   timestamptz,
        data           jsonb not null default '{}',
        created_at     timestamptz not null default now(),
        updated_at     timestamptz not null default now()
      );
      alter table public.work_diaries enable row level security;
      do $$ begin
        if not exists (select 1 from pg_policies where tablename='work_diaries' and policyname='anon_all_diaries')
        then create policy "anon_all_diaries" on work_diaries for all using (true) with check (true); end if;
      end $$;
      do $$ begin
        if not exists (select 1 from pg_trigger where tgname='work_diaries_updated_at')
        then create trigger work_diaries_updated_at before update on work_diaries
          for each row execute function public.handle_updated_at(); end if;
      end $$;
      create index if not exists work_diaries_status_idx on public.work_diaries (status);
      create index if not exists work_diaries_date_idx on public.work_diaries (execution_date desc);
      create index if not exists work_diaries_updated_idx on public.work_diaries (updated_at desc);

      -- ── Cost Rates (single-row config) ────────────────────────────────────────
      create table if not exists public.cost_rates (
        id         integer primary key default 1,
        data       jsonb not null default '{}',
        updated_at timestamptz not null default now(),
        constraint single_row check (id = 1)
      );
      alter table public.cost_rates enable row level security;
      do $$ begin
        if not exists (select 1 from pg_policies where tablename='cost_rates' and policyname='anon_all_rates')
        then create policy "anon_all_rates" on cost_rates for all using (true) with check (true); end if;
      end $$;
      insert into public.cost_rates (id, data) values (1, '{}') on conflict (id) do nothing;
    `);

    await client.end();
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
    return NextResponse.json({ ok: true, message: "Schema applied successfully — all tables, indexes, and functions are up to date." });
  } catch (e) {
    await client.end().catch(() => {});
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
