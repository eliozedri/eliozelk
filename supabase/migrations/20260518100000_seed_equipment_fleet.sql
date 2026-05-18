-- =====================================================================
-- Seed: Real company equipment / fleet master data
--
-- These are REAL company assets — not pilot/test data.
-- Do NOT delete during cleanup or data resets.
--
-- Sources: docs/agents/agent-organization-master-spec.md
-- Seeded: 2026-05-18
--
-- identification_confidence values:
--   'confirmed'    — all key fields verified
--   'partial'      — some fields missing or uncertain; agent will flag
--   'unidentified' — model/specs unknown; pending physical verification
-- =====================================================================

INSERT INTO public.equipment (
  id, display_name, category_key, equipment_type,
  manufacturer, model, year,
  license_number, serial_number, chassis_number, engine_number,
  status, identification_confidence,
  technical_specs, notes,
  photos, documents,
  last_maintenance_date, next_maintenance_date,
  next_inspection_date, next_insurance_date,
  is_active
) VALUES

-- ── Road Marking Machines ─────────────────────────────────────────────────────
('equip-cmc-pm50c-st13',
 'CMC PM50C-ST-13 — מכונת סימון כבישים', 'road_marking',
 'two-component cold plastic road marking machine',
 'CMC', 'PM50C-ST-13', NULL,
 NULL, NULL, NULL, NULL,
 'active', 'confirmed',
 '{"type":"two-component cold plastic"}',
 'מכונת סימון כבישים — פלסטיק קר דו-רכיבי',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

('equip-cmc-60cst',
 'CMC 60 C-ST — מכונת סימון כבישים', 'road_marking',
 'cold plastic road marking machine',
 'CMC srl', '60 C-ST', 2020,
 NULL, '03018', NULL, NULL,
 'active', 'confirmed',
 '{"power_kw":11.92,"weight_kg":568}',
 'מכונת סימון כבישים, 2020, מ"ס 03018',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

('equip-hofmann-h11',
 'HOFMANN H11 — מכונת סימון כבישים', 'road_marking',
 'road marking machine',
 'HOFMANN', 'H11', NULL,
 NULL, NULL, NULL, NULL,
 'active', 'confirmed',
 '{}',
 'מכונת סימון כבישים HOFMANN H11',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

-- ── Production / Workshop ─────────────────────────────────────────────────────
('equip-laser-g3015x',
 'מכונת לייזר G3015X', 'production',
 'laser cutting machine',
 NULL, 'G3015X', NULL,
 NULL, NULL, NULL, NULL,
 'active', 'partial',
 '{}',
 'יצרן לא מאומת — דגם G3015X. נדרש אימות פרטי יצרן ומספר סידורי.',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

('equip-graphtec-fc8000',
 'Graphtec FC8000-130 — פלוטר חיתוך', 'production',
 'cutting plotter',
 'Graphtec', 'FC8000-130', NULL,
 NULL, NULL, NULL, NULL,
 'active', 'confirmed',
 '{}',
 'פלוטר חיתוך Graphtec FC8000-130',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

('equip-baykal-hgl3100',
 'Baykal HGL 3100x6 — גיליוטינה', 'production',
 'guillotine shear',
 'Baykal', 'HGL 3100x6', NULL,
 NULL, NULL, NULL, NULL,
 'active', 'confirmed',
 '{"cutting_width_mm":3100,"thickness_mm":6}',
 'גיליוטינה Baykal HGL 3100x6',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

-- ── Heavy Equipment ───────────────────────────────────────────────────────────
('equip-orteco-smart800',
 'ORTECO SMART 800 — מקדח גלגלתי', 'heavy_equipment',
 'pile driver on crawler',
 'ORTECO', 'SMART 800', 2011,
 NULL, NULL, NULL, NULL,
 'active', 'confirmed',
 '{"power_kw":21.2,"weight_kg":2950}',
 'מקדח על זחלים ORTECO SMART 800, שנת 2011',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

('equip-sunward-swl3230',
 'SUNWARD SWL 3230 — טרקטורון / צמ"ה', 'heavy_equipment',
 'compact loader',
 'SUNWARD', 'SWL 3230', NULL,
 NULL, NULL, NULL, NULL,
 'active', 'confirmed',
 '{}',
 'טרקטורון קומפקטי SUNWARD SWL 3230',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

-- ── Forklift ──────────────────────────────────────────────────────────────────
('equip-fd35ct',
 'FD35CT — מלגזה', 'forklifts',
 'forklift',
 NULL, 'FD35CT', NULL,
 NULL, NULL, '309392', NULL,
 'active', 'partial',
 '{"capacity_kg":3000,"lift_height_mm":4700}',
 'מלגזה FD35CT — יצרן לאימות. שלדה 309392.',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

-- ── Generators ────────────────────────────────────────────────────────────────
('equip-js45-generator',
 'Shamdling JS 45.4 — גנרטור שקט', 'generators',
 'silent diesel generator',
 'Shamdling', 'JS 45.4', NULL,
 NULL, 'S-4942', NULL, 'John Deere 4039D',
 'active', 'confirmed',
 '{"power_kw":45,"engine":"John Deere 4039D","type":"silent diesel"}',
 'גנרטור שקט דיזל 45kW, מנוע John Deere 4039D, מ"ס S-4942',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

('equip-mitsubishi-gen',
 'יחידת גנרטור ניידת — מיצובישי', 'generators',
 'mobile generator unit',
 'Mitsubishi', NULL, NULL,
 NULL, NULL, NULL, NULL,
 'pending_approval', 'unidentified',
 '{}',
 'יחידת גנרטור ניידת קטנה — מותג מיצובישי, דגם לאימות.',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

-- ── Vehicles / Fleet ──────────────────────────────────────────────────────────
('equip-ford-superduty',
 'Ford Super Duty — טנדר', 'fleet',
 'pickup truck',
 'Ford', 'Super Duty', NULL,
 NULL, NULL, NULL, NULL,
 'active', 'partial',
 '{}',
 'טנדר פורד Super Duty — מספר רישוי לאימות.',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

('equip-man-tgl',
 'MAN TGL — משאית עם זרוע', 'fleet',
 'truck with crane/loading arm',
 'MAN', 'TGL', NULL,
 NULL, NULL, NULL, NULL,
 'active', 'partial',
 '{}',
 'משאית MAN TGL עם זרוע הרמה — אפשרי דגם 18.250, לאימות. מספר רישוי לאימות.',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

('equip-isuzu-nqr',
 'Isuzu NQR — משאית', 'fleet',
 'truck',
 'Isuzu', 'NQR', NULL,
 '88-165-62', NULL, NULL, NULL,
 'active', 'confirmed',
 '{}',
 'משאית Isuzu NQR, רישוי 88-165-62',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

('equip-hino-300',
 'Hino 300 — משאית', 'fleet',
 'truck',
 'Hino', '300', NULL,
 '231-70-602', NULL, NULL, NULL,
 'active', 'confirmed',
 '{}',
 'משאית Hino 300, רישוי 231-70-602',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

('equip-isuzu-dmax',
 'Isuzu D-Max — טנדר', 'fleet',
 'pickup truck',
 'Isuzu', 'D-Max', NULL,
 '32-806-55', NULL, NULL, NULL,
 'active', 'confirmed',
 '{}',
 'טנדר Isuzu D-Max, רישוי 32-806-55',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

('equip-man-tgm-15250',
 'MAN TGM 15.250 — משאית', 'fleet',
 'truck',
 'MAN', 'TGM 15.250', NULL,
 '63-998-68', NULL, NULL, NULL,
 'active', 'confirmed',
 '{}',
 'משאית MAN TGM 15.250, רישוי 63-998-68',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

-- ── Trailers ──────────────────────────────────────────────────────────────────
('equip-trailer-open',
 'נגרר פתוח — רשת/דפנות מתכת', 'trailers',
 'open trailer',
 NULL, NULL, NULL,
 '99-877-79', NULL, NULL, NULL,
 'active', 'partial',
 '{"sides":"metal mesh"}',
 'נגרר פתוח עם רשת/דפנות מתכת, רישוי 99-877-79 — לאימות.',
 '[]', '[]', NULL, NULL, NULL, NULL, true),

-- Arrow cart / lighting trailer
('equip-trailer-mb-v4',
 'נגרר תאורה MB-V4 — M.Bar', 'arrow_carts',
 'lighting trailer',
 'M.Bar Maintenance LTD', 'MB-V4', 2019,
 '652-20-201', NULL, 'KG91W17AMKG098001', NULL,
 'active', 'confirmed',
 '{"total_weight_kg":690,"lighting":"Atlas Copco"}',
 'נגרר תאורה MB-V4, Atlas Copco, 2019, 690kg, שלדה KG91W17AMKG098001',
 '[]', '[]', NULL, NULL, NULL, NULL, true)

ON CONFLICT (id) DO UPDATE SET
  display_name             = EXCLUDED.display_name,
  category_key             = EXCLUDED.category_key,
  equipment_type           = EXCLUDED.equipment_type,
  manufacturer             = EXCLUDED.manufacturer,
  model                    = EXCLUDED.model,
  year                     = EXCLUDED.year,
  license_number           = EXCLUDED.license_number,
  serial_number            = EXCLUDED.serial_number,
  chassis_number           = EXCLUDED.chassis_number,
  engine_number            = EXCLUDED.engine_number,
  technical_specs          = EXCLUDED.technical_specs,
  notes                    = EXCLUDED.notes,
  updated_at               = now();
