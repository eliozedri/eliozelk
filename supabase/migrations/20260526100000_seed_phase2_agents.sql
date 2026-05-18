-- =====================================================================
-- Seed: Phase 2 Agents
-- Adds orders-agent and equipment-fleet-agent to the agents table.
-- Pattern matches existing agent seed migrations exactly.
-- Both agents start at autonomy_level 0 (analysis + exceptions only).
-- =====================================================================

INSERT INTO public.agents (
  id, name, type, department, description,
  autonomy_level, allowed_read_scopes, allowed_write_scopes, requires_approval_for,
  status, icon, color
) VALUES
  (
    'orders-agent',
    'מנהל הזמנות',
    'orders',
    'operations',
    'מנהל הזמנות ומחזור חיי הזמנה. מזהה הזמנות חסרות שדות נדרשים, הזמנות תקועות בשלב הקלטה, הזמנות ממתינות לאישור ביצוע לפי לקוח, והזמנות שצריכות ניתוב לשלב הבא. לא משנה נתוני הזמנה ולא מאשר ביצוע ללא אישור מפורש.',
    0,
    ARRAY['work_orders'],
    ARRAY['agent_tasks', 'agent_exceptions', 'agent_activity_feed'],
    ARRAY['order_status_change', 'order_routing', 'order_close'],
    'idle', '📋', '#2563eb'
  ),
  (
    'equipment-fleet-agent',
    'מנהל ציוד ורכבים',
    'equipment_fleet',
    'fleet',
    'מנהל ציוד, רכבים ותחזוקה. עוקב אחר תקינות ציוד, תוקפי טסט, ביטוח ורישיון, מועדי תחזוקה קרובים ועברי. מזהה ציוד לא שמיש, רשומות חסרות ובעיות זיהוי. לא מסמן ציוד לא בטוח כמוכן לשיגור ולא מאשר פעולות תחזוקה ללא אישור בעלים.',
    0,
    ARRAY['equipment'],
    ARRAY['agent_tasks', 'agent_exceptions', 'agent_activity_feed'],
    ARRAY['equipment_status_change', 'maintenance_approval', 'safety_override'],
    'idle', '🚛', '#7c3aed'
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
