-- Seed: Coordination & QA Manager agent
-- Adds coordination-qa-agent to the agents table.
-- Pattern matches 20260516100000_agent_framework.sql exactly.
-- autonomy_level 0 = analysis only; no scan routes exist yet.

INSERT INTO public.agents (
  id, name, type, department, description,
  autonomy_level, allowed_read_scopes, allowed_write_scopes, requires_approval_for,
  status, icon, color
) VALUES (
  'coordination-qa-agent',
  'מנהלת תיאומים ו-QA',
  'coordination_qa',
  'operations',
  'מנהלת תיאומים ובקרת איכות — עוזרת מנהל תפעול. מתאמת עבודות מול לקוחות, מזמינים ואנשי קשר. מאמתת מוכנות הזמנות לפני תזמון. מזהה סתירות בין סטטוס, התקדמות, תורי מחלקות, לוח הבקרה ועדכוני מערכת. בודקת שערי מחסן, גרפיקה, ייצור ומסגרייה. מעלה תקיעות ומצבים בלתי-אפשריים למנהל הפעילות. מונעת תזמון עבודות לפני סגירת השערים התפעוליים.',
  0,
  ARRAY['work_orders'],
  ARRAY[]::text[],
  ARRAY[]::text[],
  'idle', '🔍', '#0891b2'
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
