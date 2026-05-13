-- =====================================================================
-- Normalize work_orders: eliminate last-write-wins JSONB overwrite risk
--
-- 1. Promote department-owned operational fields to first-class columns
--    so Graphics, Fabrication, Accounting, and Scheduling writes touch
--    only their own columns — no cross-domain blob clobber possible.
-- 2. Extract problems[] and activities[] into dedicated tables with
--    proper FK constraints and independent mutation paths.
-- 3. Add version column for optimistic locking: every update increments
--    the version and checks it in the WHERE clause. Version mismatch
--    (0 rows updated) = conflict → rollback + refetch, not silent loss.
-- 4. Keep data JSONB as a "content blob" for order content (signRows,
--    miscRows, notes, attachments, fabricationDetails) written at
--    creation and not concurrently modified across departments.
-- =====================================================================

-- ── 1. Promote operational columns ──────────────────────────────────

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS version                   integer       NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS contact_person            text,
  ADD COLUMN IF NOT EXISTS ordered_by                text,
  ADD COLUMN IF NOT EXISTS location                  text,
  ADD COLUMN IF NOT EXISTS job_slash                 text,
  ADD COLUMN IF NOT EXISTS reference                 text,
  -- Graphics domain
  ADD COLUMN IF NOT EXISTS graphics_sent_at          timestamptz,
  ADD COLUMN IF NOT EXISTS graphics_acknowledged_at  timestamptz,
  ADD COLUMN IF NOT EXISTS graphics_acknowledged_by  text,
  ADD COLUMN IF NOT EXISTS graphics_completed_at     timestamptz,
  -- Fabrication domain
  ADD COLUMN IF NOT EXISTS fabrication_required      boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fabrication_status        text,
  ADD COLUMN IF NOT EXISTS fabrication_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS fabrication_completed_at  timestamptz,
  -- Accounting domain
  ADD COLUMN IF NOT EXISTS accounting_status         text          NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS invoiced_at               timestamptz,
  ADD COLUMN IF NOT EXISTS invoiced_by               text,
  ADD COLUMN IF NOT EXISTS invoice_number            text,
  ADD COLUMN IF NOT EXISTS billed_amount             numeric(12,2),
  -- Field execution domain
  ADD COLUMN IF NOT EXISTS estimated_execution_hours numeric(5,1),
  ADD COLUMN IF NOT EXISTS ready_for_execution_at    timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_crew_id          text,
  ADD COLUMN IF NOT EXISTS scheduled_date            text;

-- ── 2. Backfill columns from JSONB ───────────────────────────────────

UPDATE public.work_orders SET
  contact_person               = data->>'contactPerson',
  ordered_by                   = data->>'orderedBy',
  location                     = data->>'location',
  job_slash                    = data->>'jobSlash',
  reference                    = data->>'reference',
  graphics_sent_at             = COALESCE(
                                   NULLIF(data->>'graphicsSentAt', '')::timestamptz,
                                   created_at
                                 ),
  graphics_acknowledged_at     = NULLIF(data->>'graphicsAcknowledgedAt', '')::timestamptz,
  graphics_acknowledged_by     = NULLIF(data->>'graphicsAcknowledgedBy', ''),
  graphics_completed_at        = NULLIF(data->>'graphicsCompletedAt', '')::timestamptz,
  fabrication_required         = COALESCE((data->>'fabricationRequired')::boolean, false),
  fabrication_status           = NULLIF(data->>'fabricationStatus', ''),
  fabrication_acknowledged_at  = NULLIF(data->>'fabricationAcknowledgedAt', '')::timestamptz,
  fabrication_completed_at     = NULLIF(data->>'fabricationCompletedAt', '')::timestamptz,
  accounting_status            = COALESCE(NULLIF(data->>'accountingStatus', ''), 'pending'),
  invoiced_at                  = NULLIF(data->>'invoicedAt', '')::timestamptz,
  invoiced_by                  = data->>'invoicedBy',
  invoice_number               = data->>'invoiceNumber',
  billed_amount                = NULLIF(data->>'billedAmount', '')::numeric,
  estimated_execution_hours    = NULLIF(data->>'estimatedExecutionHours', '')::numeric,
  ready_for_execution_at       = NULLIF(data->>'readyForExecutionAt', '')::timestamptz,
  assigned_crew_id             = data->>'assignedCrewId',
  scheduled_date               = data->>'scheduledDate';

-- ── 3. order_problems table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_problems (
  id               text        PRIMARY KEY,
  order_id         text        NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  department       text        NOT NULL,
  category         text        NOT NULL DEFAULT 'other',
  description      text        NOT NULL DEFAULT '',
  status           text        NOT NULL DEFAULT 'open',
  reported_at      timestamptz NOT NULL DEFAULT now(),
  reported_by      text,
  resolved_at      timestamptz,
  resolved_by      text,
  resolution_notes text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_problems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_order_problems" ON public.order_problems;
CREATE POLICY "auth_all_order_problems" ON public.order_problems
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS order_problems_updated_at ON public.order_problems;
CREATE TRIGGER order_problems_updated_at
  BEFORE UPDATE ON public.order_problems
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 4. Backfill order_problems ────────────────────────────────────────

INSERT INTO public.order_problems
  (id, order_id, department, category, description, status,
   reported_at, reported_by, resolved_at, resolved_by, resolution_notes,
   created_at, updated_at)
SELECT
  (p->>'id'),
  wo.id,
  COALESCE(p->>'department',   'office'),
  COALESCE(p->>'category',     'other'),
  COALESCE(p->>'description',  ''),
  COALESCE(p->>'status',       'open'),
  COALESCE(NULLIF(p->>'reportedAt',  '')::timestamptz, wo.created_at),
  NULLIF(p->>'reportedBy', ''),
  NULLIF(p->>'resolvedAt', '')::timestamptz,
  NULLIF(p->>'resolvedBy', ''),
  NULLIF(p->>'resolutionNotes', ''),
  COALESCE(NULLIF(p->>'reportedAt', '')::timestamptz, wo.created_at),
  COALESCE(NULLIF(p->>'reportedAt', '')::timestamptz, wo.created_at)
FROM public.work_orders wo,
     jsonb_array_elements(COALESCE(wo.data->'problems', '[]'::jsonb)) AS p
WHERE jsonb_typeof(COALESCE(wo.data->'problems', '[]'::jsonb)) = 'array'
  AND jsonb_array_length(COALESCE(wo.data->'problems', '[]'::jsonb)) > 0
  AND (p->>'id') IS NOT NULL
  AND (p->>'id') <> ''
ON CONFLICT (id) DO NOTHING;

-- ── 5. order_activities table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_activities (
  id          text        PRIMARY KEY,
  order_id    text        NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  timestamp   timestamptz NOT NULL DEFAULT now(),
  by          text,
  department  text,
  description text        NOT NULL DEFAULT '',
  meta        jsonb
);

ALTER TABLE public.order_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_order_activities" ON public.order_activities;
CREATE POLICY "auth_all_order_activities" ON public.order_activities
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- order_activities is append-only; no updated_at trigger needed

-- ── 6. Backfill order_activities ──────────────────────────────────────

INSERT INTO public.order_activities
  (id, order_id, type, timestamp, by, department, description, meta)
SELECT
  (a->>'id'),
  wo.id,
  COALESCE(a->>'type',        'status_changed'),
  COALESCE(NULLIF(a->>'timestamp', '')::timestamptz, wo.created_at),
  NULLIF(a->>'by', ''),
  NULLIF(a->>'department', ''),
  COALESCE(a->>'description', ''),
  a->'meta'
FROM public.work_orders wo,
     jsonb_array_elements(COALESCE(wo.data->'activities', '[]'::jsonb)) AS a
WHERE jsonb_typeof(COALESCE(wo.data->'activities', '[]'::jsonb)) = 'array'
  AND jsonb_array_length(COALESCE(wo.data->'activities', '[]'::jsonb)) > 0
  AND (a->>'id') IS NOT NULL
  AND (a->>'id') <> ''
ON CONFLICT (id) DO NOTHING;

-- ── 7. Realtime + replica identity ───────────────────────────────────

ALTER TABLE public.order_problems   REPLICA IDENTITY FULL;
ALTER TABLE public.order_activities REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_problems;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_activities;

-- ── 8. Useful indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_order_problems_order_id
  ON public.order_problems (order_id);

CREATE INDEX IF NOT EXISTS idx_order_activities_order_id
  ON public.order_activities (order_id);

CREATE INDEX IF NOT EXISTS idx_work_orders_status
  ON public.work_orders (status);

CREATE INDEX IF NOT EXISTS idx_work_orders_fabrication_status
  ON public.work_orders (fabrication_status)
  WHERE fabrication_required = true;

CREATE INDEX IF NOT EXISTS idx_work_orders_accounting_status
  ON public.work_orders (accounting_status)
  WHERE status = 'completed';
