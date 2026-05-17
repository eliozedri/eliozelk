-- =====================================================================
-- Agent Architecture Finalization
-- Adds: coordination-qa-agent (was missing from DB), fabrication-agent (new)
-- engineering-plan-agent: untouched — kept as future/out-of-core analysis agent
-- Pattern: safe idempotent insert; ON CONFLICT updates descriptive fields only
-- =====================================================================

INSERT INTO public.agents (
  id, name, type, department, description,
  autonomy_level, allowed_read_scopes, allowed_write_scopes, requires_approval_for,
  status, icon, color
) VALUES
  (
    'coordination-qa-agent',
    'מחלקת תיאומים ו-QA',
    'coordination_qa',
    'operations',
    'מחלקת תיאומים ובקרת איכות. מתאמת עבודות מול לקוחות, מזמינים ואנשי קשר. מתאמת לוחות זמנים ותיאום פנימי בין מחלקות. מאמתת מוכנות הזמנות לפני תזמון. מזהה סתירות בין סטטוס, התקדמות ותורי מחלקות. בודקת שערי מחסן, גרפיקה, ייצור ומסגרייה. מעלה תקיעות ומצבים בלתי-אפשריים למנהל הפעילות.',
    0,
    ARRAY['work_orders'],
    ARRAY[]::text[],
    ARRAY[]::text[],
    'idle', '🔍', '#0891b2'
  ),
  (
    'fabrication-agent',
    'מחלקת מסגרייה',
    'fabrication',
    'fabrication',
    'מחלקת מסגרייה ועיבוד מתכת. מעקב סטטוס עבודות מסגרייה וריתוך, ניהול מוכנות ייצור לפני שליחת צוותים לשטח, תיאום עם מחלקת תיאומים ו-QA ועבודות שטח, מעקב עיבוד מתכת ומוכנות חומרים.',
    0,
    ARRAY['work_orders'],
    ARRAY[]::text[],
    ARRAY[]::text[],
    'idle', '⚙️', '#f97316'
  )
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  color       = EXCLUDED.color,
  updated_at  = now();
