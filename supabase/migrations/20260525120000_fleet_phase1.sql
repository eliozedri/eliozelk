-- =====================================================================
-- Fleet & Machines — Phase 1
-- "צי רכב ומכונות" operational module.
--
-- Additive, non-destructive:
--   1. Adds 5 nullable columns to public.equipment.
--   2. Creates 3 child tables: equipment_maintenance_records,
--      equipment_incidents, equipment_tasks.
--
-- No financial tables, no equipment_id on financial documents — those
-- belong to Phase 2. linked_document_id below is a nullable, no-FK
-- placeholder so Phase 2 can wire the asset↔document link without a
-- schema change.
--
-- Categories are TypeScript-only (no DB CHECK on equipment.category_key),
-- so the expanded category list needs no migration.
-- =====================================================================

-- ── 1. New columns on equipment (all nullable) ───────────────────────────────

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS out_of_service_reason text,
  ADD COLUMN IF NOT EXISTS current_location      text,
  ADD COLUMN IF NOT EXISTS business_use          text,
  ADD COLUMN IF NOT EXISTS license_expiry_date   date,
  ADD COLUMN IF NOT EXISTS mileage               integer;

-- ── 2. equipment_maintenance_records — service history per asset ─────────────

CREATE TABLE IF NOT EXISTS public.equipment_maintenance_records (
  id                 text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  equipment_id       text        NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  service_date       date,
  scheduled_date     date,
  maintenance_type   text        NOT NULL DEFAULT '',
  description        text        NOT NULL DEFAULT '',
  provider           text        NOT NULL DEFAULT '',
  cost               numeric,
  parts_replaced     text        NOT NULL DEFAULT '',
  notes              text        NOT NULL DEFAULT '',
  status             text        NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'in_progress', 'completed', 'needs_check')),
  -- Phase 2 financial link placeholder — intentionally NO foreign key yet.
  linked_document_id text,
  attachments        jsonb       NOT NULL DEFAULT '[]',
  created_by         text        NOT NULL DEFAULT '',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equip_maint_equipment
  ON public.equipment_maintenance_records (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equip_maint_status
  ON public.equipment_maintenance_records (status);
CREATE INDEX IF NOT EXISTS idx_equip_maint_scheduled
  ON public.equipment_maintenance_records (scheduled_date)
  WHERE scheduled_date IS NOT NULL;

-- ── 3. equipment_incidents — faults / accidents / events per asset ───────────

CREATE TABLE IF NOT EXISTS public.equipment_incidents (
  id              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  equipment_id    text        NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  opened_at       date        NOT NULL DEFAULT CURRENT_DATE,
  incident_type   text        NOT NULL DEFAULT 'fault'
                    CHECK (incident_type IN ('fault', 'accident', 'issue', 'damage', 'inspection', 'other')),
  severity        text        NOT NULL DEFAULT 'medium'
                    CHECK (severity IN ('low', 'medium', 'high', 'urgent')),
  description     text        NOT NULL DEFAULT '',
  status          text        NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  reported_by     text        NOT NULL DEFAULT '',
  required_action text        NOT NULL DEFAULT '',
  due_date        date,
  resolution      text        NOT NULL DEFAULT '',
  cost            numeric,
  photos          jsonb       NOT NULL DEFAULT '[]',
  attachments     jsonb       NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equip_incident_equipment
  ON public.equipment_incidents (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equip_incident_status
  ON public.equipment_incidents (status);
CREATE INDEX IF NOT EXISTS idx_equip_incident_open_severity
  ON public.equipment_incidents (severity)
  WHERE status IN ('open', 'in_progress');

-- ── 4. equipment_tasks — reminders / scheduled tasks per asset ───────────────

CREATE TABLE IF NOT EXISTS public.equipment_tasks (
  id                   text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  equipment_id         text        NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  title                text        NOT NULL DEFAULT '',
  task_type            text        NOT NULL DEFAULT '',
  due_date             date,
  status               text        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'done', 'cancelled')),
  reminder_at          date,
  notes                text        NOT NULL DEFAULT '',
  linked_maintenance_id text,
  created_by           text        NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equip_task_equipment
  ON public.equipment_tasks (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equip_task_pending_due
  ON public.equipment_tasks (due_date)
  WHERE status = 'pending';

-- ── 5. Row Level Security (authenticated full access, mirrors equipment) ─────

ALTER TABLE public.equipment_maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_incidents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_tasks               ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_equip_maint" ON public.equipment_maintenance_records;
CREATE POLICY "auth_all_equip_maint" ON public.equipment_maintenance_records
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_all_equip_incident" ON public.equipment_incidents;
CREATE POLICY "auth_all_equip_incident" ON public.equipment_incidents
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_all_equip_task" ON public.equipment_tasks;
CREATE POLICY "auth_all_equip_task" ON public.equipment_tasks
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ── 6. updated_at triggers (matches equipment table) ─────────────────────────

DROP TRIGGER IF EXISTS equip_maint_updated_at ON public.equipment_maintenance_records;
CREATE TRIGGER equip_maint_updated_at
  BEFORE UPDATE ON public.equipment_maintenance_records
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS equip_incident_updated_at ON public.equipment_incidents;
CREATE TRIGGER equip_incident_updated_at
  BEFORE UPDATE ON public.equipment_incidents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS equip_task_updated_at ON public.equipment_tasks;
CREATE TRIGGER equip_task_updated_at
  BEFORE UPDATE ON public.equipment_tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 7. Realtime publications (idempotent) ────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'equipment_maintenance_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment_maintenance_records;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'equipment_incidents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment_incidents;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'equipment_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment_tasks;
  END IF;
END$$;
