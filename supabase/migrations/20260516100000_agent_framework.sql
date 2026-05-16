-- =====================================================================
-- Agent Framework — Phase 1
-- Creates the infrastructure for the Digital Operations Command Center.
-- Agents are seeded with definitions; task/exception scan logic comes in
-- Phase 2. All tables use authenticated-only RLS.
-- =====================================================================

-- ── Agents ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agents (
  id                    text          PRIMARY KEY,
  name                  text          NOT NULL,
  type                  text          NOT NULL,
  department            text          NOT NULL,
  description           text          NOT NULL DEFAULT '',
  autonomy_level        integer       NOT NULL DEFAULT 1 CHECK (autonomy_level BETWEEN 0 AND 5),
  allowed_read_scopes   text[]        NOT NULL DEFAULT '{}',
  allowed_write_scopes  text[]        NOT NULL DEFAULT '{}',
  requires_approval_for text[]        NOT NULL DEFAULT '{}',
  status                text          NOT NULL DEFAULT 'idle',
  icon                  text,
  color                 text,
  last_run_at           timestamptz,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_agents" ON public.agents;
CREATE POLICY "auth_all_agents" ON public.agents
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS agents_updated_at ON public.agents;
CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Agent Tasks ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              text          NOT NULL REFERENCES public.agents(id),
  related_entity_type   text,
  related_entity_id     text,
  title                 text          NOT NULL,
  description           text          NOT NULL DEFAULT '',
  priority              text          NOT NULL DEFAULT 'normal',
  status                text          NOT NULL DEFAULT 'open',
  recommended_action    text,
  requires_approval     boolean       NOT NULL DEFAULT false,
  assigned_to           text,
  due_date              timestamptz,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_agent_tasks" ON public.agent_tasks;
CREATE POLICY "auth_all_agent_tasks" ON public.agent_tasks
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_id   ON public.agent_tasks (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status      ON public.agent_tasks (status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_entity      ON public.agent_tasks (related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_priority    ON public.agent_tasks (priority) WHERE status = 'open';

DROP TRIGGER IF EXISTS agent_tasks_updated_at ON public.agent_tasks;
CREATE TRIGGER agent_tasks_updated_at
  BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Agent Exceptions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_exceptions (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                text          NOT NULL REFERENCES public.agents(id),
  severity                text          NOT NULL DEFAULT 'warn',
  category                text          NOT NULL,
  related_entity_type     text,
  related_entity_id       text,
  title                   text          NOT NULL,
  description             text          NOT NULL DEFAULT '',
  detected_from_data      jsonb,
  recommended_resolution  text,
  status                  text          NOT NULL DEFAULT 'open',
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_agent_exceptions" ON public.agent_exceptions;
CREATE POLICY "auth_all_agent_exceptions" ON public.agent_exceptions
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_agent_exceptions_agent_id  ON public.agent_exceptions (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_exceptions_severity  ON public.agent_exceptions (severity);
CREATE INDEX IF NOT EXISTS idx_agent_exceptions_status    ON public.agent_exceptions (status);
CREATE INDEX IF NOT EXISTS idx_agent_exceptions_entity    ON public.agent_exceptions (related_entity_type, related_entity_id);

DROP TRIGGER IF EXISTS agent_exceptions_updated_at ON public.agent_exceptions;
CREATE TRIGGER agent_exceptions_updated_at
  BEFORE UPDATE ON public.agent_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Agent Approvals ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            text          NOT NULL REFERENCES public.agents(id),
  task_id             uuid          REFERENCES public.agent_tasks(id),
  action_type         text          NOT NULL,
  action_payload      jsonb         NOT NULL DEFAULT '{}',
  risk_level          text          NOT NULL DEFAULT 'medium',
  requested_by_agent  text          NOT NULL,
  approval_status     text          NOT NULL DEFAULT 'pending',
  approved_by         text,
  approved_at         timestamptz,
  rejected_reason     text,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_agent_approvals" ON public.agent_approvals;
CREATE POLICY "auth_all_agent_approvals" ON public.agent_approvals
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_agent_approvals_status    ON public.agent_approvals (approval_status);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_agent_id  ON public.agent_approvals (agent_id);

DROP TRIGGER IF EXISTS agent_approvals_updated_at ON public.agent_approvals;
CREATE TRIGGER agent_approvals_updated_at
  BEFORE UPDATE ON public.agent_approvals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Agent Decisions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_decisions (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              text          NOT NULL REFERENCES public.agents(id),
  related_entity_type   text,
  related_entity_id     text,
  decision_type         text          NOT NULL,
  decision_summary      text          NOT NULL,
  source_data           jsonb,
  confidence_score      numeric       CHECK (confidence_score BETWEEN 0 AND 1),
  result                text,
  created_at            timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_agent_decisions" ON public.agent_decisions;
CREATE POLICY "auth_all_agent_decisions" ON public.agent_decisions
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_agent_decisions_agent_id    ON public.agent_decisions (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_created_at  ON public.agent_decisions (created_at DESC);

-- ── Agent Action Logs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_action_logs (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              text          NOT NULL REFERENCES public.agents(id),
  action_type           text          NOT NULL,
  action_payload        jsonb,
  result                text,
  error_message         text,
  related_entity_type   text,
  related_entity_id     text,
  created_at            timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_action_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_agent_action_logs" ON public.agent_action_logs;
CREATE POLICY "auth_all_agent_action_logs" ON public.agent_action_logs
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_agent_action_logs_agent_id    ON public.agent_action_logs (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_action_logs_created_at  ON public.agent_action_logs (created_at DESC);

-- ── Agent Activity Feed ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_activity_feed (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              text          NOT NULL REFERENCES public.agents(id),
  related_agent_id      text          REFERENCES public.agents(id),
  related_entity_type   text,
  related_entity_id     text,
  message_type          text          NOT NULL,
  content               text          NOT NULL,
  structured_payload    jsonb,
  created_at            timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_activity_feed ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_agent_activity_feed" ON public.agent_activity_feed;
CREATE POLICY "auth_all_agent_activity_feed" ON public.agent_activity_feed
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_agent_activity_feed_agent_id    ON public.agent_activity_feed (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_feed_created_at  ON public.agent_activity_feed (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_feed_entity      ON public.agent_activity_feed (related_entity_type, related_entity_id);

-- ── Realtime ─────────────────────────────────────────────────────────────────
ALTER TABLE public.agents               REPLICA IDENTITY FULL;
ALTER TABLE public.agent_tasks          REPLICA IDENTITY FULL;
ALTER TABLE public.agent_exceptions     REPLICA IDENTITY FULL;
ALTER TABLE public.agent_approvals      REPLICA IDENTITY FULL;
ALTER TABLE public.agent_activity_feed  REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_exceptions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_activity_feed;

-- ── Seed Default Agents ───────────────────────────────────────────────────────
INSERT INTO public.agents (
  id, name, type, department, description,
  autonomy_level, allowed_read_scopes, allowed_write_scopes, requires_approval_for,
  status, icon, color
) VALUES
  (
    'ops-orchestrator',
    'מנהל תפעול',
    'orchestrator',
    'operations',
    'מתאם מרכזי בין כל המחלקות. מזהה תקיעות, חוסרים, ועמידה בזמנים בכל שרשרת הערך. מספק סיכומים תפעוליים למנהל ומנתב אירועים לסוכנים המתאימים.',
    1,
    ARRAY['work_orders','work_diaries','crews','customers','catalog_items','order_problems'],
    ARRAY['agent_tasks','agent_exceptions','agent_activity_feed'],
    ARRAY['cross_department_escalation','status_override','external_communication'],
    'idle', '🎯', '#1d6fd8'
  ),
  (
    'inventory-agent',
    'מנהל מחסן',
    'inventory',
    'warehouse',
    'מנהל מחסן דיגיטלי. מזהה מחסורים, מנגנוני הזמנה, תנועות מלאי, וסטיות בין הזמנות לסחורה בפועל. מכין טיוטות בקשות רכש לאישור.',
    1,
    ARRAY['work_orders','catalog_items','work_diaries'],
    ARRAY['agent_tasks','agent_exceptions','agent_activity_feed'],
    ARRAY['supplier_order','stock_adjustment','delivery_note_approval'],
    'idle', '📦', '#0d9488'
  ),
  (
    'field-ops-agent',
    'מנהל שטח',
    'field_operations',
    'field',
    'מנהל פעילות שטח דיגיטלי. מאמת יומני שטח, מזהה יומנים חסרים או לא מושלמים, בודק עמידה בתכנון, ומכין נתוני ביצוע מאומתים לחיוב.',
    1,
    ARRAY['work_diaries','work_orders','crews'],
    ARRAY['agent_tasks','agent_exceptions','agent_activity_feed'],
    ARRAY['diary_approval','crew_assignment','billing_trigger'],
    'idle', '🚧', '#ea580c'
  ),
  (
    'graphics-production-agent',
    'מנהל גרפיקה וייצור',
    'graphics_production',
    'graphics',
    'מתאם גרפיקה וייצור דיגיטלי. מנהל סטטוס גרפיקה, מאמת קבצים ומפרטי חומר, ומזהה הזמנות תקועות. מתאם עם מחסן ולקוחות.',
    1,
    ARRAY['work_orders','catalog_items'],
    ARRAY['agent_tasks','agent_exceptions','agent_activity_feed'],
    ARRAY['customer_file_approval','production_start','material_spec_change'],
    'idle', '🎨', '#9333ea'
  ),
  (
    'catalog-pricing-agent',
    'מנהל קטלוג ותמחור',
    'catalog_pricing',
    'catalog',
    'עוזר קטלוג ותמחור. מזהה כפילויות, פריטים חסרי עלות, יחידות מידה חסרות, ומציע נורמליזציה ומיפוי לפריטי חופשי-טקסט. לא משנה מחירים ללא אישור.',
    1,
    ARRAY['catalog_items','work_orders'],
    ARRAY['agent_tasks','agent_exceptions','agent_activity_feed'],
    ARRAY['price_change','item_merge','item_delete'],
    'idle', '🏷️', '#ca8a04'
  ),
  (
    'cfo-agent',
    'מנהל כספים',
    'cfo',
    'finance',
    'בקר כספי ורווחיות. מחשב רווחיות לפי עבודה, לקוח, צוות ותקופה. מזהה הפסדים, פערי תמחור, ועלויות חריגות. לא מאשר הנחות או מסמכים פיננסיים ללא אישור.',
    1,
    ARRAY['work_diaries','work_orders','cost_rates','customers','catalog_items'],
    ARRAY['agent_tasks','agent_exceptions','agent_activity_feed'],
    ARRAY['price_change','discount_approval','financial_document','historical_record_edit'],
    'idle', '💰', '#15803d'
  ),
  (
    'billing-collections-agent',
    'מנהל גביה וחשבונות',
    'billing_collections',
    'accounting',
    'בקר חיוב וגביה. מזהה עבודות שלא חויבו, חשבוניות פתוחות, ולקוחות מאחרי תשלום. מכין רשימות חיוב סוף חודש. לא שולח חשבוניות ללא אישור.',
    1,
    ARRAY['work_orders','work_diaries','customers'],
    ARRAY['agent_tasks','agent_exceptions','agent_activity_feed'],
    ARRAY['invoice_send','collection_message','payment_confirmation'],
    'idle', '🧾', '#0284c7'
  ),
  (
    'engineering-plan-agent',
    'מנתח תכניות הנדסה',
    'engineering_analysis',
    'engineering',
    'סוכן ניתוח תכניות הנדסה — מודול עתידי. יגיע ביכולת לנתח קבצי PDF הנדסיים ולחלץ כמויות מדידה עם ציון ביטחון וביאור ויזואלי. כרגע: ניתוח בלבד, לא פעיל.',
    0,
    ARRAY['work_orders'],
    ARRAY[]::text[],
    ARRAY['quantity_approval','plan_analysis_save'],
    'idle', '📐', '#6366f1'
  )
ON CONFLICT (id) DO UPDATE SET
  name                  = EXCLUDED.name,
  description           = EXCLUDED.description,
  autonomy_level        = EXCLUDED.autonomy_level,
  allowed_read_scopes   = EXCLUDED.allowed_read_scopes,
  allowed_write_scopes  = EXCLUDED.allowed_write_scopes,
  requires_approval_for = EXCLUDED.requires_approval_for,
  icon                  = EXCLUDED.icon,
  color                 = EXCLUDED.color,
  updated_at            = now();

-- ── Seed initialization activity entries ─────────────────────────────────────
INSERT INTO public.agent_activity_feed (agent_id, message_type, content, structured_payload)
SELECT
  id,
  'status_change',
  'סוכן אותחל במערכת — מוכן לפעולה בעת הפעלת Phase 2',
  jsonb_build_object('event', 'system_init', 'autonomy_level', autonomy_level, 'phase', 1)
FROM public.agents;
