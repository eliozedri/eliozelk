-- Restore + expand core Elkayam catalog items.
-- Uses ON CONFLICT (id) DO UPDATE SET to restore items deleted by go-live cleanup.
-- Safe to re-run: idempotent UPSERT.
-- Sources: company profile (2026), official website (elkayam.co.il).

INSERT INTO catalog_items (
  id, name, type, category, unit_of_measure,
  default_price, cost_price, description,
  is_active, current_quantity, minimum_quantity, reserved_quantity,
  metadata, created_at, updated_at
) VALUES

-- ── עבודות סימון וצביעה ──────────────────────────────────────────────────────
('svc-mark-001', 'סימון וצביעת כבישים',                     'service', 'עבודות סימון וצביעה', 'מ"ר',   NULL, NULL, 'סימון וצביעת כבישים — כולל הכנת שטח, חומרים, וביצוע',      true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-mark-002', 'סימון וצביעת חניונים',                    'service', 'עבודות סימון וצביעה', 'מ"ר',   NULL, NULL, 'סימון וצביעת חניונים — שורות חנייה, כיוונים, מספרים',      true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-mark-003', 'סימון וצביעת אבני שפה ומדרכות',           'service', 'עבודות סימון וצביעה', 'מטר',   NULL, NULL, 'סימון וצביעת אבני שפה ומדרכות בצבע',                        true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-mark-004', 'סימון וצביעת שבילי אופניים',              'service', 'עבודות סימון וצביעה', 'מטר',   NULL, NULL, 'סימון וצביעת שבילי אופניים — כולל חיצים וסמלים',           true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-mark-005', 'סימון וצביעת מעברי חצייה',                'service', 'עבודות סימון וצביעה', 'יחידה', NULL, NULL, 'סימון וצביעת מעבר חצייה קומפלט',                            true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-mark-006', 'סימון ותמרור חניית נכים קומפלט',          'service', 'עבודות סימון וצביעה', 'יחידה', NULL, NULL, 'חניית נכים — סימון קרקע, תמרור, וסמל נגישות קומפלט',       true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-mark-007', 'סימון וצביעת מגרשי ספורט',                'service', 'עבודות סימון וצביעה', 'מ"ר',   NULL, NULL, 'סימון מגרשי ספורט — כדורגל, כדורסל, טניס ועוד',            true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-mark-008', 'סימון תרמו פלסטי',                        'service', 'עבודות סימון וצביעה', 'מ"ר',   NULL, NULL, 'יריעות תרמו פלסטיות לעמידות ארוכת שנים — גמרות, חיצים',   true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-mark-009', 'ציפוי נגד החלקה (אנטי סליפ)',             'service', 'עבודות סימון וצביעה', 'מ"ר',   NULL, NULL, 'ציפוי משטחים בחומרים מונעי החלקה',                          true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-mark-010', 'סימון נגישות לכבדי ראיה',                 'service', 'עבודות סימון וצביעה', 'מטר',   NULL, NULL, 'סימון נגישות לכבדי ראיה — משטחים מבוסיסים ומוחשיים',     true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),

-- ── הסרת סימון ──────────────────────────────────────────────────────────────
('svc-remv-001', 'הסרת סימון בלחץ מים',                     'service', 'הסרת סימון',           'מ"ר',   NULL, NULL, 'הסרת צבע כביש בלחץ מים — בהסמכת נתיבי ישראל',             true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-remv-002', 'הסרת סימון כדוריות פלדה (שוט בלסטינג)',   'service', 'הסרת סימון',           'מ"ר',   NULL, NULL, 'הסרת סימון כדוריות פלדה — בהסמכת נתיבי ישראל',            true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),

-- ── הסדרי תנועה ──────────────────────────────────────────────────────────────
('svc-traf-001', 'הסדר תנועה זמני',                          'service',   'הסדרי תנועה',    'יחידה', NULL, NULL, 'תכנון והקמת הסדר תנועה זמני לאתר עבודה — כולל שילוט וגדרות', true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-traf-002', 'הסדר תנועה קבוע',                          'service',   'הסדרי תנועה',    'יחידה', NULL, NULL, 'תכנון והתקנת הסדר תנועה קבוע — תמרורים, קוים ואביזרים',   true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-traf-003', 'פקח תנועה',                                 'labor',     'הסדרי תנועה',    'משמרת', NULL, NULL, 'פקח תנועה מוסמך — אחזקת אתר עבודה בהסמכת נתיבי ישראל',   true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-traf-004', 'עגלת חץ',                                   'equipment', 'הסדרי תנועה',    'יום',   NULL, NULL, 'אספקת עגלת חץ עם פנסים מהבהבים לאתר עבודה',               true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}],"fleet_managed":true}', now(), now()),
('svc-traf-005', 'צוות אבטחה בדרכים',                        'labor',     'הסדרי תנועה',    'משמרת', NULL, NULL, 'צוות אבטחה ופיקוח בדרכים לאתר עבודה',                       true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),

-- ── עבודות שטח ולוגיסטיקה ───────────────────────────────────────────────────
('svc-field-001', 'עבודת מנוף',           'labor',   'עבודות שטח ולוגיסטיקה', 'שעה',   NULL, NULL, 'עבודת מנוף — גישה לגובה, התקנה, ופירוק',                   true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-field-002', 'הובלה ומשלוח',         'service', 'עבודות שטח ולוגיסטיקה', 'יחידה', NULL, NULL, 'הובלה ומשלוח של ציוד / מוצרים ללקוח',                       true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-field-003', 'עבודות התקנה',         'labor',   'עבודות שטח ולוגיסטיקה', 'שעה',   NULL, NULL, 'עבודות התקנה בשטח — שילוט, מעקות, עמודים ואביזרים',       true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-field-004', 'עבודות שטח מיוחדות',  'service', 'עבודות שטח ולוגיסטיקה', 'יחידה', NULL, NULL, 'עבודות שטח מיוחדות שאינן מסווגות בקטגוריה אחרת',           true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('svc-field-005', 'תכנון והסדרת תנועה',  'service', 'עבודות שטח ולוגיסטיקה', 'יחידה', NULL, NULL, 'תכנון הסדרי תנועה זמניים ואספקת תוכנית מפורטת',            true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),

-- ── מעקות ומחסומים ────────────────────────────────────────────────────────────
('prd-barr-001', 'מעקה בטיחות להולכי רגל',            'product', 'מעקות ומחסומים', 'מטר',   NULL, NULL, 'מעקה בטיחות לשביל הולכי רגל — פלדה או אלומיניום',        true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-barr-002', 'מעקה בטון (ניו ג׳רזי)', 'product',  'מעקות ומחסומים', 'מטר',   NULL, NULL, 'מחסום בטון ניו ג׳רזי להסדרי תנועה',                      true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-barr-003', 'מחסום נייד',             'product',  'מעקות ומחסומים', 'יחידה', NULL, NULL, 'מחסום נייד — פלסטיק ממולא מים, לאתרי עבודה',             true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-barr-004', 'סופג אנרגיה / יחידת קצה', 'product','מעקות ומחסומים', 'יחידה', NULL, NULL, 'סופג אנרגיה ויחידות קצה למעקות בטיחות',                  true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-barr-005', 'עמוד מחסום פחוס (פריק)', 'product',  'מעקות ומחסומים', 'יחידה', NULL, NULL, 'עמוד מחסום פחוס / מתקפל — להגנת עמדות וחניות',          true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-barr-006', 'עמוד מחסום מואר',        'product',  'מעקות ומחסומים', 'יחידה', NULL, NULL, 'עמוד מחסום עם תאורה מובנית — גלות / LED',                true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),

-- ── גדרות ותיחום ──────────────────────────────────────────────────────────────
('prd-fenc-001', 'גדר בטיחות SAFEGATE',   'product', 'גדרות ותיחום', 'מטר',   NULL, NULL, 'גדר בטיחות פלסטיק SAFEGATE — חסינת אתרי בנייה',         true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-fenc-002', 'גדר מתקפלת',            'product', 'גדרות ותיחום', 'מטר',   NULL, NULL, 'גדר מתקפלת לגידור זמני של אתרים',                        true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-fenc-003', 'גדר קל-גד',             'product', 'גדרות ותיחום', 'מטר',   NULL, NULL, 'גדר קל-גד — גידור זמני ומהיר לאתרי בנייה ואירועים',     true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-fenc-004', 'בסיסי כובד לגדרות',     'product', 'גדרות ותיחום', 'יחידה', NULL, NULL, 'בסיסי כובד מבטון או פלסטיק לעיגון גדרות זמניות',        true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),

-- ── אביזרי חנייה ──────────────────────────────────────────────────────────────
('prd-park-001', 'מעצור חנייה',    'product', 'אביזרי חנייה', 'יחידה', NULL, NULL, 'מעצור חנייה גומי / פלסטיק — curb stop לחניות',          true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-park-002', 'מראה פנורמית',   'product', 'אביזרי חנייה', 'יחידה', NULL, NULL, 'מראה פנורמית — נירוסטה, אקרליק, פוליקרבונאט',           true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-park-003', 'מגן פינות',      'product', 'אביזרי חנייה', 'יחידה', NULL, NULL, 'מגן פינות — פלסטיק / גומי — לפינות קירות וגרמי מדרגות', true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-park-004', 'עמוד גמיש',      'product', 'אביזרי חנייה', 'יחידה', NULL, NULL, 'עמוד גמיש — flexible post — לתיחום ופרידת נתיבים',      true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),

-- ── אביזרי כבישים ─────────────────────────────────────────────────────────────
('prd-road-001', 'פס האטה — גומי / PVC',    'product', 'אביזרי כבישים', 'מטר',   NULL, NULL, 'פס האטה גומי או PVC — speed bump להאטת מהירות',         true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-road-002', 'מגן כבלים',               'product', 'אביזרי כבישים', 'מטר',   NULL, NULL, 'מגן כבלים — cable cover — מעבר בטוח לכבלים בשטח',      true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-road-003', 'עיני חתול',               'product', 'אביזרי כבישים', 'יחידה', NULL, NULL, 'עיני חתול — road studs — תחום קווי נתיב בלילה',         true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-road-004', 'עיני חתול סולאריים',      'product', 'אביזרי כבישים', 'יחידה', NULL, NULL, 'עיני חתול סולאריים — solar cat eyes — נראות לילית',     true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-road-005', 'פנס מהבהב סולארי',        'product', 'אביזרי כבישים', 'יחידה', NULL, NULL, 'פנס מהבהב סולארי — solar blinking light לאתרי עבודה',   true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-road-006', 'מדבקות נגד החלקה',        'product', 'אביזרי כבישים', 'יחידה', NULL, NULL, 'מדבקות אנטי סליפ — anti-slip stickers למדרגות ורצפות', true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-road-007', 'מד מהירות סולארי',        'product', 'אביזרי כבישים', 'יחידה', NULL, NULL, 'מד מהירות אלקטרוני סולארי — radar speed display',       true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),

-- ── גובים ותעלות תקשורת ───────────────────────────────────────────────────────
('prd-cond-001', 'גוב / תא בקרה נייד HDPE',           'product', 'גובים ותעלות', 'יחידה', NULL, NULL, 'גוב / תא בקרה נייד מ-HDPE — cable management vault',    true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('prd-cond-002', 'תעלה ניידת לכבלי תקשורת וחשמל',     'product', 'גובים ותעלות', 'מטר',   NULL, NULL, 'תעלה ניידת להעברת כבלי תקשורת וחשמל בשטח',             true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),

-- ── דיגלונים ─────────────────────────────────────────────────────────────────
('prd-flag-001', 'דיגלון', 'product', 'דיגלונים', 'יחידה', NULL, NULL, 'דיגלון — flag — להכוונה חזותית ועיצוב שטח', true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),

-- ── שלטים ושילוט ─────────────────────────────────────────────────────────────
('sgn-001', 'תמרור סטנדרטי',                            'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'תמרור לפי תקן ישראלי — כל הסוגים — מוסמך נתיבי ישראל',       true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-002', 'סטנד לתמרור ושילוט',                       'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'עמוד / סטנד להתקנת תמרורים ושלטים',                          true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-003', 'חבק לתמרור / שלט',                         'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'חבק התקנה — clamp — לתמרורים ושלטים על עמודים',             true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-004', 'שרוול אנטי גרפיטי לתמרור',                 'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שרוול ציפוי אנטי גרפיטי לתמרורים — מניעת ונדליזם',         true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-005', 'תמרור סולארי / שלט LED סולארי',             'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'תמרור עם תאורת LED סולארית — נראות לילית משופרת',           true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-006', 'שלט אכיפה',                                 'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שלט אכיפה — חניה אסורה, גרירה, תו חניה ועוד',              true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-007', 'שלט רחוב סטנדרטי',                         'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שלט שם רחוב — אלומיניום — עיצוב סטנדרטי',                   true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-008', 'שלט רחוב בעיצוב מיוחד',                    'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שלט שם רחוב בעיצוב מיוחד לפי דרישת הרשות',                 true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-009', 'שלט פולט אור / מואר',                       'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שלט מואר — תאורה פנימית או חיצונית — LED או פלואורסנט',     true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-010', 'שלט תדמית',                                 'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שלט תדמית — image/branding sign — לחברות ומוסדות',         true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-011', 'שלט גן / שטח ירוק',                        'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שלטי גנים ופארקים — כולל הנחיות ומידע ציבורי',             true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-012', 'שלט חניון — כיוון / מידע',                 'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שלטי הכוונה ומידע לחניונים — כיוון, כניסה, יציאה',        true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-013', 'שלט נתיבי ישראל / תחבורה ציבורית',         'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שלטי מאושרי נתיבי ישראל — תחבורה ציבורית, מסילות, כבישים', true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-014', 'שלט בטיחות',                               'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שלטי בטיחות — אזהרה, סיכון, ציוד מגן, חירום',             true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-015', 'שילוט מיוחד',                              'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שילוט מיוחד שאינו מסווג בקטגוריה אחרת',                    true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-016', 'אותיות תלת מימד',                          'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'אותיות 3D — אלומיניום, אקריליק, PVC — לחזיתות ושלטות',     true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-017', 'שלט LED סולארי',                           'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שלט LED סולארי — dynamic sign — הצגת מידע משתנה',          true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-018', 'פנסי LED סולאריים שקועים',                 'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'פנסי LED סולאריים שקועים — recessed solar LED — לכבישים', true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-019', 'חומרי התקנה לשילוט',                       'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'ברגים, בולטים, עוגנים ואביזרי התקנה לשלטים ותמרורים',     true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-020', 'תמרור סולארי עם LED לנגישות',              'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'תמרור נגישות סולארי עם תאורת LED — לאתרי בנייה ונגישות', true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),
('sgn-021', 'שלט מידע / הכוונה כללי',                   'product', 'שלטים ושילוט', 'יחידה', NULL, NULL, 'שלט הכוונה כללי — wayfinding — למוסדות, קמפוסים, שטחים',  true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now())

ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  type            = EXCLUDED.type,
  category        = EXCLUDED.category,
  unit_of_measure = EXCLUDED.unit_of_measure,
  description     = EXCLUDED.description,
  is_active       = EXCLUDED.is_active,
  metadata        = EXCLUDED.metadata,
  updated_at      = now();
