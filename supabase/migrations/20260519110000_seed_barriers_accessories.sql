-- Seed catalog items: barriers, fencing, parking products, road safety, flags.
-- Groups: ג׳ (barriers/railings) + ד׳ (fencing) + ה׳ (parking products) +
--         ח׳ (road safety accessories) + ט׳ (conduit & cable management)
-- All default_price values are NULL — prices are set per quote.
-- These are REAL business items, not test data.

INSERT INTO catalog_items (
  id, name, type, category, unit_of_measure,
  default_price, cost_price, description,
  is_active, current_quantity, minimum_quantity, reserved_quantity,
  created_at, updated_at
) VALUES

-- ── מעקות ומחסומים ────────────────────────────────────────────────────────────
('prd-barr-001', 'מעקה בטיחות להולכי רגל',            'product',   'מעקות ומחסומים',   'מטר',   NULL, NULL, 'מעקה בטיחות לשביל הולכי רגל — פלדה או אלומיניום',        true, 0, 0, 0, now(), now()),
('prd-barr-002', 'מעקה בטון (ניו ג׳רזי)',              'product',   'מעקות ומחסומים',   'מטר',   NULL, NULL, 'מחסום בטון ניו ג׳רזי להסדרי תנועה',                      true, 0, 0, 0, now(), now()),
('prd-barr-003', 'מחסום נייד',                          'product',   'מעקות ומחסומים',   'יחידה', NULL, NULL, 'מחסום נייד — פלסטיק ממולא מים, לאתרי עבודה',             true, 0, 0, 0, now(), now()),
('prd-barr-004', 'סופג אנרגיה / יחידת קצה',            'product',   'מעקות ומחסומים',   'יחידה', NULL, NULL, 'סופג אנרגיה ויחידות קצה למעקות בטיחות',                  true, 0, 0, 0, now(), now()),
('prd-barr-005', 'עמוד מחסום פחוס (פריק)',              'product',   'מעקות ומחסומים',   'יחידה', NULL, NULL, 'עמוד מחסום פחוס / מתקפל — להגנת עמדות וחניות',          true, 0, 0, 0, now(), now()),
('prd-barr-006', 'עמוד מחסום מואר',                     'product',   'מעקות ומחסומים',   'יחידה', NULL, NULL, 'עמוד מחסום עם תאורה מובנית — גלות / LED',                true, 0, 0, 0, now(), now()),

-- ── גדרות ותיחום ──────────────────────────────────────────────────────────────
('prd-fenc-001', 'גדר בטיחות SAFEGATE',                 'product',   'גדרות ותיחום',     'מטר',   NULL, NULL, 'גדר בטיחות פלסטיק SAFEGATE — חסינת אתרי בנייה',         true, 0, 0, 0, now(), now()),
('prd-fenc-002', 'גדר מתקפלת',                          'product',   'גדרות ותיחום',     'מטר',   NULL, NULL, 'גדר מתקפלת לגידור זמני של אתרים',                        true, 0, 0, 0, now(), now()),
('prd-fenc-003', 'גדר קל-גד',                           'product',   'גדרות ותיחום',     'מטר',   NULL, NULL, 'גדר קל-גד — גידור זמני ומהיר לאתרי בנייה ואירועים',     true, 0, 0, 0, now(), now()),
('prd-fenc-004', 'בסיסי כובד לגדרות',                   'product',   'גדרות ותיחום',     'יחידה', NULL, NULL, 'בסיסי כובד מבטון או פלסטיק לעיגון גדרות זמניות',        true, 0, 0, 0, now(), now()),

-- ── אביזרי בטיחות — מוצרי חנייה ──────────────────────────────────────────────
('prd-park-001', 'מעצור חנייה',                         'product',   'אביזרי חנייה',     'יחידה', NULL, NULL, 'מעצור חנייה גומי / פלסטיק — curb stop לחניות',          true, 0, 0, 0, now(), now()),
('prd-park-002', 'מראה פנורמית',                        'product',   'אביזרי חנייה',     'יחידה', NULL, NULL, 'מראה פנורמית — נירוסטה, אקרליק, פוליקרבונאט',           true, 0, 0, 0, now(), now()),
('prd-park-003', 'מגן פינות',                           'product',   'אביזרי חנייה',     'יחידה', NULL, NULL, 'מגן פינות — פלסטיק / גומי — לפינות קירות וגרמי מדרגות', true, 0, 0, 0, now(), now()),
('prd-park-004', 'עמוד גמיש',                           'product',   'אביזרי חנייה',     'יחידה', NULL, NULL, 'עמוד גמיש — flexible post — לתיחום ופרידת נתיבים',      true, 0, 0, 0, now(), now()),

-- ── אביזרי בטיחות — מוצרי כבישים ─────────────────────────────────────────────
('prd-road-001', 'פס האטה — גומי / PVC',                'product',   'אביזרי כבישים',   'מטר',   NULL, NULL, 'פס האטה גומי או PVC — speed bump להאטת מהירות',         true, 0, 0, 0, now(), now()),
('prd-road-002', 'מגן כבלים',                           'product',   'אביזרי כבישים',   'מטר',   NULL, NULL, 'מגן כבלים — cable cover — מעבר בטוח לכבלים בשטח',      true, 0, 0, 0, now(), now()),
('prd-road-003', 'עיני חתול',                           'product',   'אביזרי כבישים',   'יחידה', NULL, NULL, 'עיני חתול — road studs — תחום קווי נתיב בלילה',         true, 0, 0, 0, now(), now()),
('prd-road-004', 'עיני חתול סולאריים',                  'product',   'אביזרי כבישים',   'יחידה', NULL, NULL, 'עיני חתול סולאריים — solar cat eyes — נראות לילית',     true, 0, 0, 0, now(), now()),
('prd-road-005', 'פנס מהבהב סולארי',                    'product',   'אביזרי כבישים',   'יחידה', NULL, NULL, 'פנס מהבהב סולארי — solar blinking light לאתרי עבודה',   true, 0, 0, 0, now(), now()),
('prd-road-006', 'מדבקות נגד החלקה',                    'product',   'אביזרי כבישים',   'יחידה', NULL, NULL, 'מדבקות אנטי סליפ — anti-slip stickers למדרגות ורצפות', true, 0, 0, 0, now(), now()),
('prd-road-007', 'מד מהירות סולארי',                    'product',   'אביזרי כבישים',   'יחידה', NULL, NULL, 'מד מהירות אלקטרוני סולארי — radar speed display',       true, 0, 0, 0, now(), now()),

-- ── גובים ותעלות תקשורת ───────────────────────────────────────────────────────
('prd-cond-001', 'גוב / תא בקרה נייד HDPE',             'product',   'גובים ותעלות',     'יחידה', NULL, NULL, 'גוב / תא בקרה נייד מ-HDPE — cable management vault',    true, 0, 0, 0, now(), now()),
('prd-cond-002', 'תעלה ניידת לכבלי תקשורת וחשמל',       'product',   'גובים ותעלות',     'מטר',   NULL, NULL, 'תעלה ניידת להעברת כבלי תקשורת וחשמל בשטח',             true, 0, 0, 0, now(), now()),

-- ── דיגלונים ─────────────────────────────────────────────────────────────────
('prd-flag-001', 'דיגלון',                              'product',   'דיגלונים',         'יחידה', NULL, NULL, 'דיגלון — flag — להכוונה חזותית ועיצוב שטח',             true, 0, 0, 0, now(), now())

ON CONFLICT (id) DO NOTHING;
