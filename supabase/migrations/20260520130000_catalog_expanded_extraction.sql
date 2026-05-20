-- Catalog expansion: items from website and company profile not covered by M2/M3.
-- Includes design/fabrication services and road products extracted from official sources.

INSERT INTO catalog_items (
  id, name, type, category, unit_of_measure,
  default_price, cost_price, description,
  is_active, current_quantity, minimum_quantity, reserved_quantity,
  metadata, created_at, updated_at
) VALUES

('svc-design-001', 'שירות גרפיקה לתכנון ועיצוב שלטים', 'service', 'עבודות שטח ולוגיסטיקה', 'יחידה',
 NULL, NULL, 'תכנון ועיצוב גרפי לשלטים, תמרורים ופרויקטי שילוט לפי דרישת הלקוח.',
 true, 0, 0, 0, '{"sources":[{"type":"company_profile","note":"פרופיל חברה 2026"}]}', now(), now()),

('svc-fab-001', 'ייצור שלטים לפי הזמנה', 'service', 'שלטים ושילוט', 'יחידה',
 NULL, NULL, 'ייצור שלטים ותמרורים בהתאמה אישית לפי מפרט הלקוח — אלומיניום, PVC, אקריליק.',
 true, 0, 0, 0, '{"sources":[{"type":"company_profile","note":"פרופיל חברה 2026"}]}', now(), now()),

('prd-fenc-005', 'גדר מדברת / חיפוי גדר', 'product', 'גדרות ותיחום', 'מ"ר',
 NULL, NULL, 'גדר מדברת וחיפוי גדר — פתרון אסתטי ופרקטי לחיפוי גדרות זמניות ואתרי בנייה.',
 true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now()),

('prd-road-009', 'פסי האטה גומי', 'product', 'אביזרי כבישים', 'מטר',
 NULL, NULL, 'פסי האטה מגומי — speed bump גומי להאטת מהירות — עמידות גבוהה לתנאי שטח ומזג אוויר.',
 true, 0, 0, 0, '{"sources":[{"type":"website","note":"elkayam.co.il"}]}', now(), now())

ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  type            = EXCLUDED.type,
  category        = EXCLUDED.category,
  unit_of_measure = EXCLUDED.unit_of_measure,
  description     = EXCLUDED.description,
  is_active       = EXCLUDED.is_active,
  metadata        = EXCLUDED.metadata,
  updated_at      = now();
