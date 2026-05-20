-- =====================================================================
-- Link safety reference IDs to catalog_items
--
-- Every item in the /safety page (SafetyAccessoriesPage, sa-001..sa-037)
-- is also represented in catalog_items with a nanoid ID (bulk-imported
-- via UI from safetyAccessories.ts). This migration links them bidirectionally
-- by adding:
--   metadata.safety_ref_id   — the sa-* reference ID from the physical catalog
--   metadata.orderable        — true: this item is orderable/billable in work orders
--
-- Rule: every /safety item MUST have a catalog_items record.
-- The /safety page is the rich reference viewer (images, dimensions, variants).
-- catalog_items is the canonical operational record (pricing, stock, orders).
--
-- Non-destructive: uses metadata || jsonb_build_object(...) to merge fields.
-- Safe to re-run (idempotent via metadata merge).
-- =====================================================================

UPDATE catalog_items ci
SET
  metadata = ci.metadata || jsonb_build_object('safety_ref_id', ref.safety_ref_id, 'orderable', true),
  updated_at = now()
FROM (VALUES
  ('TRhSRvUACflvX5IwpFJYC', 'sa-001'),  -- קונוסים
  ('GOqZDZrXFXXAYYEDWs3En', 'sa-002'),  -- שרוולי קונוס
  ('79Wl9xhRFWCQVrFlGr2ft', 'sa-003'),  -- מפרדת נתיבים גמישה
  ('OhIo_q033PzhCsazx3kje', 'sa-004'),  -- עמוד גמיש
  ('1ekQ26IXG_wUgoxUhR1Mc', 'sa-005'),  -- עמוד חסימה
  ('cUfsx7CAoABYUEPqHgUKf', 'sa-006'),  -- עמודי מחסום
  ('EsC-C75zBQWjjisQ-KWCr', 'sa-007'),  -- עמודי מחסום מוארים
  ('TACI6G8-r4ARdu3scGRvj', 'sa-008'),  -- מתקנים מודולאריים לתמרורים
  ('9uwrTR3Nzjb3IK42grIvN', 'sa-009'),  -- סטנד זמני לשילוט
  ('MZ_TH7fwk6LcVcX5uCqT7', 'sa-010'),  -- פנס מהבהב סולארי
  ('GYTFwMzTSSriZa41LBCXm', 'sa-011'),  -- פנסי LED סולאריים שקועים
  ('gBjYaRrioJ1AzLoS4_OXY', 'sa-012'),  -- עיני חתול
  ('FJZKumb7mfpTVSnTekHY0', 'sa-013'),  -- עיני חתול סולאריים
  ('1xKRX6CrSPsczIc2MGsie', 'sa-014'),  -- פסי האטה PVC
  ('jIB-X38jqz9TuHocx6_yz', 'sa-015'),  -- מגן כבלים
  ('ru1CHbAEjWBkQlZ2lK108', 'sa-016'),  -- מעצור חנייה
  ('V8BixgyWPGPhJ4BoxXTMw', 'sa-017'),  -- שומר חנייה מתקפל
  ('7_QrP1JAhvNJq_cCIjMxF', 'sa-018'),  -- מחסום דוקרנים
  ('dXUHpjQGAy-VPAzXjdCEF', 'sa-019'),  -- מגן פינות לחניה
  ('Fj7y4d2tEYRIwVckcuHFW', 'sa-020'),  -- מד מהירות סולארי
  ('ni02DXfmV-U7ueZwSpQJK', 'sa-021'),  -- מראה פנורמית
  ('rgfOSR29du8l9GAUnBc8X', 'sa-022'),  -- אנטי גרפיטי לעמודים
  ('NYVsojLpbNqYfknG0xeoS', 'sa-023'),  -- חבקים לתמרורים ושלטים
  ('7vojEGfvDe540sge5q54k', 'sa-024'),  -- סרטי סימון אדום-לבן
  ('RlW7HqtABu5mWwt5HyQVm', 'sa-025'),  -- מדבקות כביש מאלומיניום
  ('5Ev81D4cQaTYuQFCyOHnQ', 'sa-026'),  -- גדר מתקפלת
  ('dnPkYvg-r6V-_PPzBE5vh', 'sa-027'),  -- גדר קל
  ('znDCE6WmnLyqKsB0QVTWx', 'sa-028'),  -- גידור זמני לאתרי בנייה
  ('ZqoYbKomotobSiaM1w1mF', 'sa-029'),  -- גדר בטיחות SAFEGATE
  ('sLzhkaKzOQXAyQUq3Q7Jo', 'sa-030'),  -- גדר רשת פלדה
  ('2Rokgo42AQnKMJs5icbK4', 'sa-031'),  -- גדר פלדה
  ('aU83KPZQNjVtSck7syy0D', 'sa-032'),  -- חיזוק פלדה לגדרות
  ('DDzqpIcmh0Jw33-D7tDvH', 'sa-033'),  -- בסיסי כובד לגדרות
  ('-GgiNqWHxIxwZxdYLRijf', 'sa-034'),  -- בסיס גומי לגדרות
  ('3VUD2_LPQlawf19AyfM4M', 'sa-035'),  -- משטח גבשושיות להכוונה
  ('0HmCjICP9XpHjdwjOppDp', 'sa-036'),  -- מדבקות למניעת החלקה
  ('8llYyYWqCCe9MORh6c8zT', 'sa-037')   -- מתקן למניעת הצפות
) AS ref(id, safety_ref_id)
WHERE ci.id = ref.id;
