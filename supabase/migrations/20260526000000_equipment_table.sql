-- =====================================================================
-- Equipment / Fleet Table
-- Tracks all company equipment: vehicles, machines, trailers,
-- heavy equipment, production equipment, and unidentified assets.
--
-- Category and status use English enum keys so application code can
-- reference stable identifiers. Hebrew display labels are maintained
-- in src/types/equipment.ts (EQUIPMENT_CATEGORY_LABELS, EQUIPMENT_STATUS_LABELS).
--
-- Phase 1 scan checks (equipment-fleet-agent):
--   - missing required identification fields
--   - partial/unidentified equipment confidence
--   - expired / near-expiring inspection, insurance, maintenance dates
--   - equipment stuck in repair > 30 / 60 days
--
-- Phase 2b (not yet built — requires equipment_assignments table):
--   - dispatch readiness per job
--   - job-level equipment availability blocking
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.equipment (
  id                        text          PRIMARY KEY,

  -- Identity
  display_name              text          NOT NULL DEFAULT '',
  category_key              text          NOT NULL,
  equipment_type            text,
  manufacturer              text,
  model                     text,
  year                      integer,

  -- Registration / legal identifiers
  license_number            text,
  chassis_number            text,
  serial_number             text,
  engine_number             text,

  -- Operational state
  -- Allowed values: 'active' | 'pending_approval' | 'in_repair' | 'unserviceable'
  status                    text          NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'pending_approval', 'in_repair', 'unserviceable')),

  -- Data quality signal: how confident are we this record is complete?
  -- Allowed values: 'confirmed' | 'partial' | 'unidentified'
  identification_confidence text          NOT NULL DEFAULT 'confirmed'
                              CHECK (identification_confidence IN ('confirmed', 'partial', 'unidentified')),

  -- Flexible spec storage: weight, dimensions, power, certifications, etc.
  technical_specs           jsonb         NOT NULL DEFAULT '{}',

  notes                     text,

  -- Photos: array of URL strings
  photos                    jsonb         NOT NULL DEFAULT '[]',

  -- Documents: array of { type, label, url, expiry_date? }
  documents                 jsonb         NOT NULL DEFAULT '[]',

  -- Maintenance and compliance dates (date type, not timestamptz)
  last_maintenance_date     date,
  next_maintenance_date     date,
  next_inspection_date      date,
  next_insurance_date       date,

  -- Soft delete: inactive = archived, keeps record for history
  is_active                 boolean       NOT NULL DEFAULT true,

  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_equipment_category_key
  ON public.equipment (category_key);

CREATE INDEX IF NOT EXISTS idx_equipment_status
  ON public.equipment (status)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_equipment_next_inspection_date
  ON public.equipment (next_inspection_date)
  WHERE is_active = true AND next_inspection_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_next_insurance_date
  ON public.equipment (next_insurance_date)
  WHERE is_active = true AND next_insurance_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_next_maintenance_date
  ON public.equipment (next_maintenance_date)
  WHERE is_active = true AND next_maintenance_date IS NOT NULL;

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_equipment" ON public.equipment;
CREATE POLICY "auth_all_equipment" ON public.equipment
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ── Updated-at trigger ────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS equipment_updated_at ON public.equipment;
CREATE TRIGGER equipment_updated_at
  BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Realtime ─────────────────────────────────────────────────────────────────

ALTER TABLE public.equipment REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment;
