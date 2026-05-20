# Catalog Source-of-Truth Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all Elkayam catalog data into a single `catalog_items` Supabase table, restore 70+ real business items deleted by the go-live cleanup, fix stale `catalogItemId` display in order forms, and mark the static `SAFETY_ACCESSORIES` TypeScript file as migration-source-only.

**Architecture:** Four sequential Supabase migrations (all additive UPSERTs, zero destructive operations) restore and expand the canonical catalog. A runtime fix in `MiscSection.tsx` distinguishes valid from stale catalog references. The `/safety` page data is decoupled (Phase 1 here) from its rendering (Phase 2 is a separate future task). No localStorage, no hardcoded item lists in UI.

**Tech Stack:** Supabase (PostgreSQL), Next.js 14 App Router, TypeScript, React.

**Spec:** `docs/superpowers/specs/2026-05-20-catalog-source-of-truth-unification-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260520100000_catalog_metadata_schema.sql` | Create | Add `metadata JSONB` column |
| `supabase/migrations/20260520110000_catalog_core_upsert.sql` | Create | UPSERT 50 core services/barriers/signage items |
| `supabase/migrations/20260520120000_catalog_safety_accessories.sql` | Create | UPSERT 37 safety accessories |
| `supabase/migrations/20260520130000_catalog_expanded_extraction.sql` | Create | UPSERT 4 additional items from website |
| `src/components/OrderForm/MiscSection.tsx` | Modify | Stale `catalogItemId` detection |
| `src/components/Catalog/index.tsx` | Modify | Source badge in item rows |
| `src/data/safetyAccessories.ts` | Modify | Add migration-source-only header comment |

---

### Task 1: M1 — Add metadata JSONB column

**Files:**
- Create: `supabase/migrations/20260520100000_catalog_metadata_schema.sql`

- [ ] **Step 1: Create the migration file with this exact content**

```sql
-- M1: Add metadata JSONB column to catalog_items.
-- metadata shape:
--   images:   [{url: string, caption: string, source: string}]
--   specs:    {dimensions: string, material: string, variants: [{label,dimension,material}]}
--   sources:  [{type: "website"|"company_profile"|"seed"|"manual", url: string, note: string}]
--   aliases:  string[]
--   fleet_only:    boolean  -- internal resource, not a sellable product; set is_active=false
--   fleet_managed: boolean  -- billable but will move to Fleet module

ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN catalog_items.metadata IS
  'Structured metadata: {images, specs, sources, aliases, fleet_only, fleet_managed}';
```

- [ ] **Step 2: Apply via Supabase CLI**

```bash
npx supabase db push
```

If CLI unavailable, paste the SQL directly in Supabase Studio → SQL Editor → Run.

- [ ] **Step 3: Verify column exists**

In Supabase Studio → Table Editor → `catalog_items`: confirm `metadata` column of type `jsonb` is present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520100000_catalog_metadata_schema.sql
git commit -m "feat(catalog): add metadata JSONB column to catalog_items"
```

---

### Task 2: M2 — UPSERT core catalog items

Restores 50 real Elkayam business items deleted by the go-live cleanup.
Items covered by M3 (safety accessories with sa-* IDs) are intentionally excluded here to avoid name duplicates.

**Files:**
- Create: `supabase/migrations/20260520110000_catalog_core_upsert.sql`

- [ ] **Step 1: Create the file with this exact content**

```sql
-- M2: UPSERT core Elkayam catalog items.
-- Source: original seed migrations 20260519100000 + 20260519110000 + 20260519120000
-- Uses ON CONFLICT (id) DO UPDATE to restore items even if previously deleted.
-- Excludes: fencing, parking accessories, road accessories — those are in M3 (sa-* IDs).
-- All default_price values are NULL — prices set per quote.

INSERT INTO catalog_items (
  id, name, type, category, unit_of_measure,
  default_price, cost_price, description, is_active,
  current_quantity, minimum_quantity, reserved_quantity,
  metadata, created_at, updated_at
) VALUES

-- ── עבודות סימון וצביעה ────────────────────────────────────────────────────────
('svc-mark-001', 'סימון וצביעת כבישים',                   'service','עבודות סימון וצביעה','מ"ר',  NULL,NULL,'סימון וצביעת כבישים — כולל הכנת שטח, חומרים, וביצוע',     true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-mark-002', 'סימון וצביעת חניונים',                  'service','עבודות סימון וצביעה','מ"ר',  NULL,NULL,'סימון וצביעת חניונים — שורות חנייה, כיוונים, מספרים',     true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-mark-003', 'סימון וצביעת אבני שפה ומדרכות',         'service','עבודות סימון וצביעה','מטר',  NULL,NULL,'סימון וצביעת אבני שפה ומדרכות בצבע',                      true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-mark-004', 'סימון וצביעת שבילי אופניים',            'service','עבודות סימון וצביעה','מטר',  NULL,NULL,'סימון וצביעת שבילי אופניים — כולל חיצים וסמלים',          true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-mark-005', 'סימון וצביעת מעברי חצייה',              'service','עבודות סימון וצביעה','יחידה',NULL,NULL,'סימון וצביעת מעבר חצייה קומפלט',                           true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-mark-006', 'סימון ותמרור חניית נכים קומפלט',        'service','עבודות סימון וצביעה','יחידה',NULL,NULL,'חניית נכים — סימון קרקע, תמרור, וסמל נגישות קומפלט',      true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-mark-007', 'סימון וצביעת מגרשי ספורט',              'service','עבודות סימון וצביעה','מ"ר',  NULL,NULL,'סימון מגרשי ספורט — כדורגל, כדורסל, טניס ועוד',           true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-mark-008', 'סימון תרמו פלסטי',                      'service','עבודות סימון וצביעה','מ"ר',  NULL,NULL,'יריעות תרמו פלסטיות לעמידות ארוכת שנים — גמרות, חיצים',  true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-mark-009', 'ציפוי נגד החלקה (אנטי סליפ)',           'service','עבודות סימון וצביעה','מ"ר',  NULL,NULL,'ציפוי משטחים בחומרים מונעי החלקה',                         true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-mark-010', 'סימון נגישות לכבדי ראיה',               'service','עבודות סימון וצביעה','מטר',  NULL,NULL,'סימון נגישות לכבדי ראיה — משטחים מבוסיסים ומוחשיים',     true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),

-- ── הסרת סימון ────────────────────────────────────────────────────────────────
('svc-remv-001', 'הסרת סימון בלחץ מים',                   'service','הסרת סימון','מ"ר',NULL,NULL,'הסרת צבע כביש בלחץ מים — בהסמכת נתיבי ישראל',              true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-remv-002', 'הסרת סימון כדוריות פלדה (שוט בלסטינג)', 'service','הסרת סימון','מ"ר',NULL,NULL,'הסרת סימון כדוריות פלדה — בהסמכת נתיבי ישראל',             true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),

-- ── הסדרי תנועה ───────────────────────────────────────────────────────────────
('svc-traf-001', 'הסדר תנועה זמני',           'service',  'הסדרי תנועה','יחידה',NULL,NULL,'תכנון והקמת הסדר תנועה זמני לאתר עבודה — כולל שילוט וגדרות',true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-traf-002', 'הסדר תנועה קבוע',           'service',  'הסדרי תנועה','יחידה',NULL,NULL,'תכנון והתקנת הסדר תנועה קבוע — תמרורים, קוים ואביזרים',    true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-traf-003', 'פקח תנועה',                 'labor',    'הסדרי תנועה','משמרת',NULL,NULL,'פקח תנועה מוסמך — אחזקת אתר עבודה בהסמכת נתיבי ישראל',    true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-traf-004', 'עגלת חץ',                   'equipment','הסדרי תנועה','יום',  NULL,NULL,'אספקת עגלת חץ עם פנסים מהבהבים לאתר עבודה',                 true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}],"fleet_managed":true}',now(),now()),
('svc-traf-005', 'צוות אבטחה בדרכים',         'labor',    'הסדרי תנועה','משמרת',NULL,NULL,'צוות אבטחה ופיקוח בדרכים לאתר עבודה',                        true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),

-- ── עבודות שטח ולוגיסטיקה ─────────────────────────────────────────────────────
('svc-field-001','עבודת מנוף',            'labor',  'עבודות שטח ולוגיסטיקה','שעה',  NULL,NULL,'עבודת מנוף — גישה לגובה, התקנה, ופירוק',                    true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-field-002','הובלה ומשלוח',          'service','עבודות שטח ולוגיסטיקה','יחידה',NULL,NULL,'הובלה ומשלוח של ציוד / מוצרים ללקוח',                        true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-field-003','עבודות התקנה',          'labor',  'עבודות שטח ולוגיסטיקה','שעה',  NULL,NULL,'עבודות התקנה בשטח — שילוט, מעקות, עמודים ואביזרים',        true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-field-004','עבודות שטח מיוחדות',   'service','עבודות שטח ולוגיסטיקה','יחידה',NULL,NULL,'עבודות שטח מיוחדות שאינן מסווגות בקטגוריה אחרת',            true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('svc-field-005','תכנון והסדרת תנועה',   'service','עבודות שטח ולוגיסטיקה','יחידה',NULL,NULL,'תכנון הסדרי תנועה זמניים ואספקת תוכנית מפורטת',              true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),

-- ── מעקות ומחסומים ────────────────────────────────────────────────────────────
('prd-barr-001','מעקה בטיחות להולכי רגל','product','מעקות ומחסומים','מטר',  NULL,NULL,'מעקה בטיחות לשביל הולכי רגל — פלדה או אלומיניום',             true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('prd-barr-002','מעקה בטון (ניו ג''רזי)', 'product','מעקות ומחסומים','מטר',  NULL,NULL,'מחסום בטון ניו ג''רזי להסדרי תנועה',                          true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('prd-barr-003','מחסום נייד',             'product','מעקות ומחסומים','יחידה',NULL,NULL,'מחסום נייד — פלסטיק ממולא מים, לאתרי עבודה',                  true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('prd-barr-004','סופג אנרגיה / יחידת קצה','product','מעקות ומחסומים','יחידה',NULL,NULL,'סופג אנרגיה ויחידות קצה למעקות בטיחות',                       true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('prd-barr-005','עמוד מחסום פחוס (פריק)', 'product','מעקות ומחסומים','יחידה',NULL,NULL,'עמוד מחסום פחוס / מתקפל — להגנת עמדות וחניות',               true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),

-- ── גובים ותעלות תקשורת ───────────────────────────────────────────────────────
('prd-cond-001','גוב / תא בקרה נייד HDPE',        'product','גובים ותעלות','יחידה',NULL,NULL,'גוב / תא בקרה נייד מ-HDPE — cable management vault',          true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('prd-cond-002','תעלה ניידת לכבלי תקשורת וחשמל',  'product','גובים ותעלות','מטר',  NULL,NULL,'תעלה ניידת להעברת כבלי תקשורת וחשמל בשטח',                   true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),

-- ── דיגלונים ──────────────────────────────────────────────────────────────────
('prd-flag-001','דיגלון','product','דיגלונים','יחידה',NULL,NULL,'דיגלון — flag — להכוונה חזותית ועיצוב שטח',                     true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),

-- ── שלטים ושילוט ──────────────────────────────────────────────────────────────
('sgn-001','תמרור סטנדרטי',                    'product','שלטים ושילוט','יחידה',NULL,NULL,'תמרור לפי תקן ישראלי — כל הסוגים — מוסמך נתיבי ישראל',       true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-002','סטנד לתמרור ושילוט',               'product','שלטים ושילוט','יחידה',NULL,NULL,'עמוד / סטנד להתקנת תמרורים ושלטים',                           true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-003','חבק לתמרור / שלט',                'product','שלטים ושילוט','יחידה',NULL,NULL,'חבק התקנה — clamp — לתמרורים ושלטים על עמודים',              true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-004','שרוול אנטי גרפיטי לתמרור',         'product','שלטים ושילוט','יחידה',NULL,NULL,'שרוול ציפוי אנטי גרפיטי לתמרורים — מניעת ונדליזם',          true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-005','תמרור סולארי / שלט LED סולארי',     'product','שלטים ושילוט','יחידה',NULL,NULL,'תמרור עם תאורת LED סולארית — נראות לילית משופרת',            true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-006','שלט אכיפה',                        'product','שלטים ושילוט','יחידה',NULL,NULL,'שלט אכיפה — חניה אסורה, גרירה, תו חניה ועוד',               true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-007','שלט רחוב סטנדרטי',                 'product','שלטים ושילוט','יחידה',NULL,NULL,'שלט שם רחוב — אלומיניום — עיצוב סטנדרטי',                    true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-008','שלט רחוב בעיצוב מיוחד',            'product','שלטים ושילוט','יחידה',NULL,NULL,'שלט שם רחוב בעיצוב מיוחד לפי דרישת הרשות',                  true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-009','שלט פולט אור / מואר',              'product','שלטים ושילוט','יחידה',NULL,NULL,'שלט מואר — תאורה פנימית או חיצונית — LED או פלואורסנט',      true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-010','שלט תדמית',                        'product','שלטים ושילוט','יחידה',NULL,NULL,'שלט תדמית — image/branding sign — לחברות ומוסדות',          true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-011','שלט גן / שטח ירוק',               'product','שלטים ושילוט','יחידה',NULL,NULL,'שלטי גנים ופארקים — כולל הנחיות ומידע ציבורי',              true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-012','שלט חניון — כיוון / מידע',         'product','שלטים ושילוט','יחידה',NULL,NULL,'שלטי הכוונה ומידע לחניונים — כיוון, כניסה, יציאה',         true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-013','שלט נתיבי ישראל / תחבורה ציבורית', 'product','שלטים ושילוט','יחידה',NULL,NULL,'שלטי מאושרי נתיבי ישראל — תחבורה ציבורית, מסילות, כבישים',  true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-014','שלט בטיחות',                       'product','שלטים ושילוט','יחידה',NULL,NULL,'שלטי בטיחות — אזהרה, סיכון, ציוד מגן, חירום',              true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-015','שילוט מיוחד',                      'product','שלטים ושילוט','יחידה',NULL,NULL,'שילוט מיוחד שאינו מסווג בקטגוריה אחרת',                     true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-016','אותיות תלת מימד',                  'product','שלטים ושילוט','יחידה',NULL,NULL,'אותיות 3D — אלומיניום, אקריליק, PVC — לחזיתות ושלטות',      true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now()),
('sgn-017','שלט LED סולארי',                   'product','שלטים ושילוט','יחידה',NULL,NULL,'שלט LED סולארי — dynamic sign — הצגת מידע משתנה',           true,0,0,0,'{"sources":[{"type":"website","note":"elkayam.co.il"}]}',now(),now())

ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  type            = EXCLUDED.type,
  category        = EXCLUDED.category,
  unit_of_measure = EXCLUDED.unit_of_measure,
  description     = EXCLUDED.description,
  is_active       = EXCLUDED.is_active,
  metadata        = EXCLUDED.metadata,
  updated_at      = now();
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Or paste in Supabase Studio → SQL Editor if CLI unavailable.

- [ ] **Step 3: Verify row count**

In Supabase Studio → SQL Editor, run:
```sql
SELECT count(*) FROM catalog_items WHERE id LIKE 'svc-%' OR id LIKE 'prd-barr%' OR id LIKE 'sgn-%' OR id LIKE 'prd-cond%' OR id LIKE 'prd-flag%';
```
Expected: `50`

Also verify עגלת חץ restored:
```sql
SELECT id, name, type, category, is_active FROM catalog_items WHERE name = 'עגלת חץ';
```
Expected: 1 row, id=`svc-traf-004`, type=`equipment`, is_active=`true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520110000_catalog_core_upsert.sql
git commit -m "feat(catalog): UPSERT 50 core Elkayam catalog items (services, barriers, signage)"
```

---

### Task 3: M3 — UPSERT all 37 safety accessories

Converts `src/data/safetyAccessories.ts` items into canonical `catalog_items` rows.
Uses sa-* IDs to ensure deterministic UPSERT. Items that overlap with prd-* names (e.g. עיני חתול, פס האטה) use the sa-* canonical version with richer metadata.

**Files:**
- Create: `supabase/migrations/20260520120000_catalog_safety_accessories.sql`

- [ ] **Step 1: Create the file with this exact content**

```sql
-- M3: UPSERT 37 safety accessories from src/data/safetyAccessories.ts.
-- Canonical IDs use sa-* prefix to match the TypeScript source.
-- Category pattern: 'אביזרי בטיחות — <subcategory>'
-- metadata.specs: {dimensions, material, variants}
-- metadata.sources: [{type:"company_profile", note:"קטלוג אביזרי בטיחות"}]

INSERT INTO catalog_items (
  id, name, type, category, unit_of_measure,
  default_price, cost_price, description, is_active,
  current_quantity, minimum_quantity, reserved_quantity,
  metadata, created_at, updated_at
) VALUES

-- ── קונוסים ואביזריהם ─────────────────────────────────────────────────────────
('sa-001','קונוסים',         'product','אביזרי בטיחות — קונוסים ואביזריהם','יחידה',NULL,NULL,
 'קונוסים לסימון ואזהרה בפני נהגים על מפגעים באזורי עבודות בכביש. מגיעים במגוון מידות.',
 true,0,0,0,
 '{"specs":{"dimensions":"50 ס\"מ — מטר 1","material":"פלסטיק גמיש","variants":["50 ס\"מ","75 ס\"מ","מטר 1"]},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות עמ'' 7"}]}',
 now(),now()),

('sa-002','שרוולי קונוס',   'product','אביזרי בטיחות — קונוסים ואביזריהם','יחידה',NULL,NULL,
 'שרוולים להשחלה על גבי קונוסים להרחבת גובהם.',
 true,0,0,0,
 '{"specs":{"dimensions":"50 ס\"מ","material":"פלסטיק גמיש"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

-- ── מפרדים ועמודים גמישים ─────────────────────────────────────────────────────
('sa-003','מפרדת נתיבים גמישה','product','אביזרי בטיחות — מפרדים ועמודים גמישים','מטר',NULL,NULL,
 'פיתרון בטיחותי להפרדה בין נתיבים במקומות בעייתיים עם תנועה דו-סטרית צפופה. התקנה קלה ומהירה.',
 true,0,0,0,
 '{"specs":{"dimensions":"גובה 11 ס\"מ"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-004','עמוד גמיש',      'product','אביזרי בטיחות — מפרדים ועמודים גמישים','יחידה',NULL,NULL,
 'עמוד גמיש ("עמוד נחום תקום") לסימון, תיחום ויצירת הפרדה. נפוץ לסימון שבילי הולכי רגל ותיחום אזורי חניה. עמיד בפני דריסה.',
 true,0,0,0,
 '{"specs":{"dimensions":"75 ס\"מ — מטר 1.35","material":"פלסטיק איכותי"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

-- ── עמודי מחסום ועמודי חסימה ─────────────────────────────────────────────────
('sa-005','עמוד חסימה',     'product','אביזרי בטיחות — עמודי מחסום ועמודי חסימה','יחידה',NULL,NULL,
 'עמודי חסימה לשימוש באירועים להכוונת קהל, לובאים ושמירת חניות. כולל בסיס לייצוב.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-006','עמודי מחסום',    'product','אביזרי בטיחות — עמודי מחסום ועמודי חסימה','יחידה',NULL,NULL,
 'עמודי מחסום לסימון, תיחום והפרדה ברחובות, כבישים, חניות ומתחמים. מגיעים גם בגרסה מוארת.',
 true,0,0,0,
 '{"specs":{"dimensions":"גובה 90 ס\"מ","material":"מתכת"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-007','עמודי מחסום מוארים','product','אביזרי בטיחות — עמודי מחסום ועמודי חסימה','יחידה',NULL,NULL,
 'עמודי מחסום עם תאורה מובנית לסימון ותיחום בתנאי תאורה לקויה.',
 true,0,0,0,
 '{"specs":{"dimensions":"גובה 90 ס\"מ","material":"מתכת"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

-- ── מתקני שילוט ואבזור תמרורים ───────────────────────────────────────────────
('sa-008','מתקנים מודולאריים לתמרורים','product','אביזרי בטיחות — מתקני שילוט ואבזור תמרורים','יחידה',NULL,NULL,
 'מתקן מעוצב עם מחזיר אור, מותאם לתמרורים בקטרים 40 ו-60 ס"מ. ניתן ליישם כל תמרור, שלט הכוונה או מסר מחומרים מחזירי אור.',
 true,0,0,0,
 '{"specs":{"dimensions":"קטר 40 ס\"מ / קטר 60 ס\"מ"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-009','סטנד זמני לשילוט','product','אביזרי בטיחות — מתקני שילוט ואבזור תמרורים','יחידה',NULL,NULL,
 'סטנד זמני לשילוט ותמרורים לפי הצורך ולכל מטרה. קל לנסיעה, קל לאחסון.',
 true,0,0,0,
 '{"specs":{"dimensions":"גובה מטר 1 / רוחב 55 ס\"מ"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-022','אנטי גרפיטי לעמודים','product','אביזרי בטיחות — מתקני שילוט ואבזור תמרורים','יחידה',NULL,NULL,
 'שומר על עמודי תמרורים מנזקי גרפיטי. השחלה על גבי העמוד. קיים בצבעים: אדום, לבן וכחול.',
 true,0,0,0,
 '{"specs":{"dimensions":"10 ס\"מ / 15 ס\"מ, עובי 2–6\"","material":"אלומיניום","variants":["10 ס\"מ","15 ס\"מ"]},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-023','חבקים לתמרורים ושלטים','product','אביזרי בטיחות — מתקני שילוט ואבזור תמרורים','יחידה',NULL,NULL,
 'חבקים לחיבור בטיחותי ויציב של שלטים ותמרורים לעמודים.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

-- ── תאורת בטיחות ועיני חתול ──────────────────────────────────────────────────
('sa-010','פנס מהבהב סולארי','product','אביזרי בטיחות — תאורת בטיחות ועיני חתול','יחידה',NULL,NULL,
 'פנס מהבהב לאזהרה וסימון בפני נהגים באזורים עם נראות לקויה. נטען מקרני השמש, אינו תלוי בחשמל חיצוני.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-011','פנסי LED סולאריים שקועים','product','אביזרי בטיחות — תאורת בטיחות ועיני חתול','יחידה',NULL,NULL,
 'פנסי לד סולאריים שקועים להתקנה על אבני שפה של כיכרות להגברת נראות וקישוט. נטענים מאנרגיית השמש.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-012','עיני חתול',      'product','אביזרי בטיחות — תאורת בטיחות ועיני חתול','יחידה',NULL,NULL,
 'מחזירי אור קטנים לסימון הדרך בכבישים חשוכים. משמשים לסימון קווי הפרדה ושוליים.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-013','עיני חתול סולאריים','product','אביזרי בטיחות — תאורת בטיחות ועיני חתול','יחידה',NULL,NULL,
 'עיני חתול סולאריים להתקנה לפני מעברי חציה לצורך הגברת ההתראה לנהגים.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

-- ── פסי האטה ומגן כבלים ───────────────────────────────────────────────────────
('sa-014','פסי האטה PVC',   'product','אביזרי בטיחות — פסי האטה ומגן כבלים','מטר',NULL,NULL,
 'פסי האטה מ-PVC להתקנה בכל דרך, שטח תפעולי, כביש או שביל, ליצירת האטה של כלי רכב.',
 true,0,0,0,
 '{"specs":{"material":"PVC"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-015','מגן כבלים',      'product','אביזרי בטיחות — פסי האטה ומגן כבלים','יחידה',NULL,NULL,
 'מוצר בטיחות לפריסת כבלים מהירה ובטוחה באזורי מעבר. פתרון רב-פעמי למניעת שחיקה מכבלים על הקרקע. עמיד במשקל רכב.',
 true,0,0,0,
 '{"specs":{"dimensions":"33×33 ס\"מ / 50×50 ס\"מ / 900×500 מ\"מ","material":"גומי קשיח","variants":["33×33 ס\"מ","50×50 ס\"מ","900×500 מ\"מ"]},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

-- ── אביזרי חניה ───────────────────────────────────────────────────────────────
('sa-016','מעצור חנייה',    'product','אביזרי בטיחות — אביזרי חניה','יחידה',NULL,NULL,
 'מעצור חניה לחניות וחניונים, מונע גלישת הרכב מעבר לתחום החניה ומניעת נזק.',
 true,0,0,0,
 '{"specs":{"dimensions":"אורך 1.90 מ''","material":"גומי"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-017','שומר חנייה מתקפל','product','אביזרי בטיחות — אביזרי חניה','יחידה',NULL,NULL,
 'שומר חניה הניתן לנעילה ולקיפול. משמש לשמירה על חניה.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-018','מחסום דוקרנים',  'product','אביזרי בטיחות — אביזרי חניה','יחידה',NULL,NULL,
 'מחסום דוקרנים למניעת כניסת רכבים בלתי מורשים ולהסדרת תנועה בחניונים.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-019','מגן פינות לחניה','product','אביזרי בטיחות — אביזרי חניה','יחידה',NULL,NULL,
 'מגן פינות סופג אנרגיה עם מחזירי אור להגברת נראות. מותקן על מבנים וחניונים למניעת פגיעה.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

-- ── מד מהירות ומראות בטיחות ──────────────────────────────────────────────────
('sa-020','מד מהירות סולארי','product','אביזרי בטיחות — מד מהירות ומראות בטיחות','יחידה',NULL,NULL,
 'תמרור מציג מהירות בזמן אמת. מערכת חכמה וחסכונית באנרגיה (ירוקה / סולארית) הפועלת אוטומטית.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-021','מראה פנורמית',   'product','אביזרי בטיחות — מד מהירות ומראות בטיחות','יחידה',NULL,NULL,
 'מראה פנורמית לשיפור נראות בפינות מסוכנות. פתרון יעיל, בטיחותי ופשוט.',
 true,0,0,0,
 '{"specs":{"dimensions":"קטרים: 60, 80, 100 ס\"מ"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

-- ── אביזרים ושילוט נוסף ───────────────────────────────────────────────────────
('sa-024','סרטי סימון אדום-לבן','product','אביזרי בטיחות — אביזרים ושילוט נוסף','גליל',NULL,NULL,
 'גליל ניילון של סרט סימון אדום-לבן לסימון ואזהרה מפני מפגעים.',
 true,0,0,0,
 '{"specs":{"material":"ניילון"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-025','מדבקות כביש מאלומיניום','product','אביזרי בטיחות — אביזרים ושילוט נוסף','יחידה',NULL,NULL,
 'מדבקות כביש מאלומיניום לעבודות זמניות. כוללות כדוריות זכוכית להגברת נראות והחזר אור בשעות החשכה.',
 true,0,0,0,
 '{"specs":{"material":"אלומיניום"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

-- ── גדרות ותיחום ──────────────────────────────────────────────────────────────
('sa-026','גדר מתקפלת',           'product','אביזרי בטיחות — גדרות ותיחום','יחידה',NULL,NULL,
 'גדרות מתקפלות מודולריות לתיחום זמני. נפתחות לאורכים שונים לפי הצורך, קלות לאחסון.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-027','גדר קל',               'product','אביזרי בטיחות — גדרות ותיחום','יחידה',NULL,NULL,
 'גדר קלה לתיחום אזורים המוגבלים למעבר הולכי רגל, עבודות בכביש ואתרי בנייה.',
 true,0,0,0,
 '{"specs":{"dimensions":"גובה 1 מ'' / רוחב 1.5 מ'' או גובה 75 ס\"מ / רוחב 1.5 מ''"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-028','גידור זמני לאתרי בנייה','service','אביזרי בטיחות — גדרות ותיחום','שירות',NULL,NULL,
 'שירות גידור ותיחום לאתרי בנייה עבור קבלנים, עיריות ותאגידים. תחימת האתר, הפרדה מהסביבה ומניעת כניסה.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-029','גדר בטיחות SAFEGATE',   'product','אביזרי בטיחות — גדרות ותיחום','יחידה',NULL,NULL,
 'גדר בטיחות SAFEGATE מ-HDPE. חוליות הניתנות לחיבור לאורך הרצוי. חוזק מיוחד לשרידות ארוכה בתנאי חוץ.',
 true,0,0,0,
 '{"specs":{"dimensions":"גובה 2 מ'' / רוחב 2 מ''","material":"HDPE"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-030','גדר רשת פלדה',          'product','אביזרי בטיחות — גדרות ותיחום','יחידה',NULL,NULL,
 'גדר רשת מתכת מגולוונת לתיחום שטחי עבודה ומפגעים. מגיעה עם בסיסים במשקל 18 ק"ג.',
 true,0,0,0,
 '{"specs":{"dimensions":"300×200 ס\"מ / 110×300 ס\"מ / 350×200 ס\"מ","material":"מתכת מגולוונת"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-031','גדר פלדה',              'product','אביזרי בטיחות — גדרות ותיחום','יחידה',NULL,NULL,
 'גדר פלדה לתיחום אזורים המוגבלים למעבר הולכי רגל, עבודות בכביש ואתרי בנייה.',
 true,0,0,0,
 '{"specs":{"dimensions":"גובה 1 מ'' / רוחב 1.5 מ''","material":"פלדה"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-032','חיזוק פלדה לגדרות',     'product','אביזרי בטיחות — גדרות ותיחום','יחידה',NULL,NULL,
 'חיזוק פלדה (חבק) לחיבור ויציבות גדרות רשת.',
 true,0,0,0,
 '{"specs":{"material":"פלדה"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-033','בסיסי כובד לגדרות',     'product','אביזרי בטיחות — גדרות ותיחום','יחידה',NULL,NULL,
 'בסיסי כובד במשקל 18 ק"ג להצבת גדרות רשת וגדרות מסוגים שונים לתיחום מפגעים ואתרי עבודה.',
 true,0,0,0,
 '{"specs":{"dimensions":"משקל 18 ק\"ג"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-034','בסיס גומי לגדרות',      'product','אביזרי בטיחות — גדרות ותיחום','יחידה',NULL,NULL,
 'בסיס גומי לגדרות בסוגים ומידות שונים.',
 true,0,0,0,
 '{"specs":{"dimensions":"גובה 25 ס\"מ×רוחב 65 ס\"מ / גובה 20 ס\"מ×רוחב 75 ס\"מ","material":"גומי"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

-- ── נגישות ומניעת הצפות ───────────────────────────────────────────────────────
('sa-035','משטח גבשושיות להכוונה',  'product','אביזרי בטיחות — נגישות ומניעת הצפות','יחידה',NULL,NULL,
 'משטח גבשושיות להכוונה מישושית לעיוורים ולקויי ראייה. לעבודות הנגשה בהתאם לתקנים.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-036','מדבקות למניעת החלקה',    'product','אביזרי בטיחות — נגישות ומניעת הצפות','יחידה',NULL,NULL,
 'מדבקות למניעת החלקה לשימוש בעבודות הנגשה.',
 true,0,0,0,
 '{"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now()),

('sa-037','מתקן למניעת הצפות',      'product','אביזרי בטיחות — נגישות ומניעת הצפות','יחידה',NULL,NULL,
 'פתרון בלעדי וייחודי למניעת הצפות. מחסום עצמאי שאינו דורש קיבוע. עוצר הצטברות משקעים עד גובה 50 ס"מ.',
 true,0,0,0,
 '{"specs":{"dimensions":"גובה עד 50 ס\"מ, כל אורך"},"sources":[{"type":"company_profile","note":"קטלוג אביזרי בטיחות"}]}',
 now(),now())

ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  type            = EXCLUDED.type,
  category        = EXCLUDED.category,
  unit_of_measure = EXCLUDED.unit_of_measure,
  description     = EXCLUDED.description,
  is_active       = EXCLUDED.is_active,
  metadata        = EXCLUDED.metadata,
  updated_at      = now();
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Verify all 37 rows inserted**

```sql
SELECT count(*) FROM catalog_items WHERE id LIKE 'sa-%';
```
Expected: `37`

Spot-check one:
```sql
SELECT id, name, category, type, metadata FROM catalog_items WHERE id = 'sa-010';
```
Expected: name=`פנס מהבהב סולארי`, category=`אביזרי בטיחות — תאורת בטיחות ועיני חתול`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520120000_catalog_safety_accessories.sql
git commit -m "feat(catalog): UPSERT 37 safety accessories from SAFETY_ACCESSORIES source"
```

---

### Task 4: M4 — UPSERT expanded extraction items

Adds real Elkayam items from the official website that were not in any previous seed.

**Files:**
- Create: `supabase/migrations/20260520130000_catalog_expanded_extraction.sql`

- [ ] **Step 1: Create the file with this exact content**

```sql
-- M4: UPSERT additional Elkayam catalog items from website/company profile
-- not covered by M2 or M3.
-- Source: מקורות מידע/website-extracted/service-product-catalog.md

INSERT INTO catalog_items (
  id, name, type, category, unit_of_measure,
  default_price, cost_price, description, is_active,
  current_quantity, minimum_quantity, reserved_quantity,
  metadata, created_at, updated_at
) VALUES

-- ── שירות גרפיקה ──────────────────────────────────────────────────────────────
('svc-design-001','שירות גרפיקה לתכנון ועיצוב שלטים','service','שלטים ושילוט','יחידה',NULL,NULL,
 'תכנון ועיצוב גרפי לשלטים, תמרורים, ושילוט מיוחד — מחלקת גרפיקה פנימית.',
 true,0,0,0,
 '{"sources":[{"type":"website","note":"elkayam.co.il — מחלקת גרפיקה"}]}',
 now(),now()),

-- ── גדר מדברת ─────────────────────────────────────────────────────────────────
('prd-fenc-005','גדר מדברת / חיפוי גדר','product','אביזרי בטיחות — גדרות ותיחום','מטר',NULL,NULL,
 'גדר מדברת — חיפוי גדרות קיימות בבד מחזיר אור לגידור אסתטי ובולט ממקום מרוחק.',
 true,0,0,0,
 '{"sources":[{"type":"website","note":"elkayam.co.il"}]}',
 now(),now()),

-- ── ייצור שלטים ───────────────────────────────────────────────────────────────
('svc-fab-001','ייצור שלטים לפי הזמנה','service','שלטים ושילוט','יחידה',NULL,NULL,
 'ייצור שלטים, תמרורים ואביזרי שילוט לפי הזמנה — חריטה, חיתוך לייזר, הדפסה ועיבוד מתכת.',
 true,0,0,0,
 '{"sources":[{"type":"website","note":"elkayam.co.il"}]}',
 now(),now()),

-- ── פסי האטה גומי (נפרד מ-PVC) ───────────────────────────────────────────────
('prd-road-009','פסי האטה גומי','product','אביזרי בטיחות — פסי האטה ומגן כבלים','מטר',NULL,NULL,
 'פסי האטה מגומי להתקנה קבועה. חומר עמיד לאורך שנים. להתקנה בחניונים ושבילים.',
 true,0,0,0,
 '{"specs":{"material":"גומי"},"sources":[{"type":"website","note":"elkayam.co.il"}]}',
 now(),now())

ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  type            = EXCLUDED.type,
  category        = EXCLUDED.category,
  unit_of_measure = EXCLUDED.unit_of_measure,
  description     = EXCLUDED.description,
  is_active       = EXCLUDED.is_active,
  metadata        = EXCLUDED.metadata,
  updated_at      = now();
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Verify**

```sql
SELECT count(*) FROM catalog_items;
```
Expected: ≥ 91 (50 from M2 + 37 from M3 + 4 from M4, plus any existing items in DB).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520130000_catalog_expanded_extraction.sql
git commit -m "feat(catalog): UPSERT 4 additional items from website/company profile extraction"
```

---

### Task 5: Stale catalog reference fix in MiscSection.tsx

An order row with `catalogItemId` set but no matching active catalog item must NOT show "מהקטלוג". It must show "⚠ קישור פג תוקף" instead.

**Files:**
- Modify: `src/components/OrderForm/MiscSection.tsx`

- [ ] **Step 1: Add useMemo to the React import**

`MiscSection.tsx` line 1 currently reads:
```tsx
import React, { useState, useRef, useEffect } from "react";
```

Replace with:
```tsx
import React, { useState, useRef, useEffect, useMemo } from "react";
```

- [ ] **Step 2: Add catalogIds set and stale detection**

Change the file. Find this exact block:

```tsx
  const { items: catalogItems } = useCatalogContext();
  const [openSuggestRowId, setOpenSuggestRowId] = useState<string | null>(null);
```

Replace with:

```tsx
  const { items: catalogItems } = useCatalogContext();
  const catalogIds = useMemo(() => new Set(catalogItems.map((c) => c.id)), [catalogItems]);
  const [openSuggestRowId, setOpenSuggestRowId] = useState<string | null>(null);
```

- [ ] **Step 3: Replace isLinked usage with isLinked + isStale**

Find this exact block (around line 155 in the `rows.map` callback):

```tsx
            const suggestions = openSuggestRowId === row.id ? getSuggestions(row.description) : [];
            const isLinked = Boolean(row.catalogItemId);
            const isDimRow = alwaysShowDimensions || (showDimensionRows && isCustomDimensionRow(row));
```

Replace with:

```tsx
            const suggestions = openSuggestRowId === row.id ? getSuggestions(row.description) : [];
            const isLinked = Boolean(row.catalogItemId) && catalogIds.has(row.catalogItemId!);
            const isStale  = Boolean(row.catalogItemId) && !catalogIds.has(row.catalogItemId!);
            const isDimRow = alwaysShowDimensions || (showDimensionRows && isCustomDimensionRow(row));
```

- [ ] **Step 4: Replace the isLinked render block**

Find this exact block (the `{isLinked ? (` branch around line 164):

```tsx
                      {isLinked ? (
                        <div className="flex items-center gap-2">
                          <span className="flex-1 px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-sm text-blue-800 font-medium">
                            {row.description}
                          </span>
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium whitespace-nowrap">
                            מהקטלוג
                            <button
                              type="button"
                              onClick={() => handleUnlink(row.id, row.description)}
                              className="hover:text-blue-900 transition-colors"
                            >
                              <XIcon />
                            </button>
                          </span>
                          {row.catalogItemUnit && (
                            <span className="text-xs text-gray-400 whitespace-nowrap">{row.catalogItemUnit}</span>
                          )}
                        </div>
                      ) : (
```

Replace with:

```tsx
                      {isLinked ? (
                        <div className="flex items-center gap-2">
                          <span className="flex-1 px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-sm text-blue-800 font-medium">
                            {row.description}
                          </span>
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium whitespace-nowrap">
                            מהקטלוג
                            <button
                              type="button"
                              onClick={() => handleUnlink(row.id, row.description)}
                              className="hover:text-blue-900 transition-colors"
                            >
                              <XIcon />
                            </button>
                          </span>
                          {row.catalogItemUnit && (
                            <span className="text-xs text-gray-400 whitespace-nowrap">{row.catalogItemUnit}</span>
                          )}
                        </div>
                      ) : isStale ? (
                        <div className="flex items-center gap-2">
                          <span className="flex-1 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-800 font-medium">
                            {row.description}
                          </span>
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium whitespace-nowrap" title="הפריט הוסר מהקטלוג — ניתן לנתק ולקשר מחדש">
                            ⚠ קישור פג תוקף
                            <button
                              type="button"
                              onClick={() => handleUnlink(row.id, row.description)}
                              className="hover:text-amber-900 transition-colors"
                            >
                              <XIcon />
                            </button>
                          </span>
                        </div>
                      ) : (
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors (or only pre-existing unrelated errors).

- [ ] **Step 6: Commit**

```bash
git add src/components/OrderForm/MiscSection.tsx
git commit -m "fix(orders): detect stale catalogItemId — show warning badge instead of misleading מהקטלוג"
```

---

### Task 6: Mark safetyAccessories.ts as migration-source-only

**Files:**
- Modify: `src/data/safetyAccessories.ts`

- [ ] **Step 1: Add header comment at the top of the file**

Find the very first line of `src/data/safetyAccessories.ts`:

```ts
import type { SafetyAccessoryItem } from "@/types/safetyAccessory";
```

Replace with:

```ts
// MIGRATION SOURCE ONLY — do not add new UI consumers to this file.
// All items here have been migrated to catalog_items (Supabase) via
// migration 20260520120000_catalog_safety_accessories.sql.
// The /safety page reads from this constant temporarily (Phase 1).
// Phase 2: refactor /safety to read from useCatalogContext() instead.
import type { SafetyAccessoryItem } from "@/types/safetyAccessory";
```

- [ ] **Step 2: Commit**

```bash
git add src/data/safetyAccessories.ts
git commit -m "docs(safety): mark SAFETY_ACCESSORIES as migration-source-only; Phase 2 refactor documented"
```

---

### Task 7: Add source badge to Catalog item rows

**Files:**
- Modify: `src/components/Catalog/index.tsx`

- [ ] **Step 1: Add a helper to extract source label**

In `src/components/Catalog/index.tsx`, find the `CatalogPage` function (around line 491). Immediately before the `return (` statement, add this helper:

```tsx
  function getSourceLabel(item: { metadata?: Record<string, unknown> }): string | null {
    const sources = item.metadata?.sources as Array<{ type: string }> | undefined;
    const first = sources?.[0]?.type;
    if (first === "website") return "אתר";
    if (first === "company_profile") return "פרופיל חברה";
    if (first === "manual") return "ידני";
    return null;
  }
```

**Note:** `CatalogItem` type must include `metadata`. Check `src/types/catalog.ts` — if `metadata` is absent, add: `metadata?: Record<string, unknown>;` to the `CatalogItem` interface and `metadata: r.metadata as Record<string, unknown> | undefined` in `fromRow()` in `useCatalog.ts`.

- [ ] **Step 2: Verify CatalogItem has metadata field**

Open `src/types/catalog.ts`. If `metadata` is not in `CatalogItem`, add it:

Find the interface body and add after `updatedAt`:
```ts
  metadata?: Record<string, unknown>;
```

Open `src/hooks/useCatalog.ts`. In `fromRow()`, add after `updatedAt`:
```ts
    metadata: r.metadata as Record<string, unknown> | undefined,
```

In `toRow()`, add after `updated_at`:
```ts
    metadata: item.metadata ?? {},
```

- [ ] **Step 3: Add source badge to the item name cell**

In the non-editing row render, find the `<td className="px-4 py-3 font-medium text-gray-900">` that shows `{item.name}`. It currently contains:

```tsx
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {item.name}
                          {(item.linkedProducts?.length ?? 0) > 0 && (
                            <span className="mr-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                              {item.linkedProducts!.length} נלווים
                            </span>
                          )}
                        </td>
```

Replace with:

```tsx
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {item.name}
                          {(item.linkedProducts?.length ?? 0) > 0 && (
                            <span className="mr-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                              {item.linkedProducts!.length} נלווים
                            </span>
                          )}
                          {getSourceLabel(item) && (
                            <span className="mr-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                              {getSourceLabel(item)}
                            </span>
                          )}
                        </td>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: zero new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/Catalog/index.tsx src/types/catalog.ts src/hooks/useCatalog.ts
git commit -m "feat(catalog): add source badge (אתר/פרופיל חברה/ידני) to catalog item rows"
```

---

### Task 8: Reverse audit — verify 23 key items exist

Confirm all canonical Elkayam items are correctly in `catalog_items`.

- [ ] **Step 1: Run the audit query**

In Supabase Studio → SQL Editor:

```sql
SELECT
  name,
  id,
  type,
  category,
  is_active
FROM catalog_items
WHERE name IN (
  'עגלת חץ',
  'הסדר תנועה זמני',
  'פקח תנועה',
  'סימון וצביעת כבישים',
  'סימון וצביעת חניונים',
  'סימון וצביעת שבילי אופניים',
  'סימון תרמו פלסטי',
  'ציפוי נגד החלקה (אנטי סליפ)',
  'הסרת סימון בלחץ מים',
  'הסרת סימון כדוריות פלדה (שוט בלסטינג)',
  'תמרור סטנדרטי',
  'שלט פולט אור / מואר',
  'שלט LED סולארי',
  'מעקה בטון (ניו ג''רזי)',
  'מעקה בטיחות להולכי רגל',
  'סופג אנרגיה / יחידת קצה',
  'גדר בטיחות SAFEGATE',
  'עיני חתול',
  'פנס מהבהב סולארי',
  'פסי האטה PVC',
  'מעצור חנייה',
  'מראה פנורמית',
  'גוב / תא בקרה נייד HDPE'
)
ORDER BY name;
```

Expected: 23 rows, all `is_active = true`.

- [ ] **Step 2: Check for any name duplicates**

```sql
SELECT name, count(*) as cnt
FROM catalog_items
GROUP BY name
HAVING count(*) > 1
ORDER BY cnt DESC;
```

Expected: zero rows (no duplicates). If duplicates exist, note which ones and decide whether to deactivate the older copy (lower ID) via the Catalog tab UI.

- [ ] **Step 3: Verify catalog autocomplete works for עגלת חץ**

Open the app → create a new order → go to "מוצרים ושירותים נוספים" section → type "עגלת" in the description field.

Expected: dropdown shows "עגלת חץ" with category "הסדרי תנועה".

- [ ] **Step 4: Verify Catalog tab search**

Navigate to `/catalog` → search for "עגלת חץ".

Expected: item found, type=ציוד, category=הסדרי תנועה, status=פעיל.

- [ ] **Step 5: Check an existing order with stale reference**

If an order exists with "עגלת חץ" showing the old "מהקטלוג" badge, open it.

Expected: badge now shows blue "מהקטלוג" (because the item was restored in M2 with the same ID `svc-traf-004`).

If the order's `catalogItemId` is `svc-traf-004` and `svc-traf-004` is now in the DB → badge is blue. The item is no longer stale.

- [ ] **Step 6: Document any remaining gaps**

Note any items from the audit that showed as missing. These may need to be added manually via the Catalog tab, or investigated for whether they belong in a future Fleet/Equipment module.

---

### Task 9: Final build check and push to GitHub

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors (or only pre-existing errors from before this work).

- [ ] **Step 2: Run the dev server and do a quick smoke test**

```bash
npm run dev
```

Navigate to:
1. `/catalog` — confirm item count increased, source badges visible, search works in Hebrew
2. New order form → "מוצרים ושירותים נוספים" → type "פקח" → confirm "פקח תנועה" appears in dropdown
3. New order form → "שלטים ושילוט" → type "תמרור" → confirm "תמרור סטנדרטי" appears
4. Confirm no broken imports, no console errors

- [ ] **Step 3: Push to GitHub**

```bash
git push origin main
```

---

## Summary of Canonical Catalog After All Migrations

| Source | ID Prefix | Count | Categories |
|--------|-----------|-------|-----------|
| M2 — services | `svc-mark-*`, `svc-remv-*`, `svc-traf-*`, `svc-field-*` | 25 | עבודות סימון, הסרת סימון, הסדרי תנועה, עבודות שטח |
| M2 — barriers | `prd-barr-*` | 5 | מעקות ומחסומים |
| M2 — conduit/flags | `prd-cond-*`, `prd-flag-*` | 3 | גובים ותעלות, דיגלונים |
| M2 — signage | `sgn-*` | 17 | שלטים ושילוט |
| M3 — safety accessories | `sa-*` | 37 | אביזרי בטיחות — [11 subcategories] |
| M4 — expanded | `svc-design-*`, `prd-fenc-005`, `svc-fab-*`, `prd-road-009` | 4 | שלטים ושילוט, גדרות ותיחום, פסי האטה |
| **Total new** | | **91** | |

Plus any items already in the DB (37 catalog items that survived the go-live cleanup).

## Catalog / Equipment Boundary Reference

| Item | In catalog | type | Notes |
|------|-----------|------|-------|
| עגלת חץ | ✓ | equipment | Billable per day; fleet_managed flag set |
| פקח תנועה | ✓ | labor | Billed per shift |
| כל שירותי הסימון | ✓ | service | Core Elkayam services |
| מכונת סימון כבישים | ✗ | — | Internal resource; future Fleet module |
| מחפרון / טרקטור | ✗ | — | Internal resource; future Fleet module |
