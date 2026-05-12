// Image mapping for safety accessories.
// productImage = the best individual product photo extracted from the PDF.
// pageImage    = the full catalog page render (for context).
// Paths are relative to /public — served at the given URL directly.

export interface SafetyImageRef {
  productImage: string | null;
  pageImage: string;
}

export const SAFETY_IMAGES: Record<string, SafetyImageRef> = {
  // ── Page 7 ─────────────────────────────────────────────────────────────
  "sa-001": { productImage: "/catalog/safety/products/p07-02.jpg", pageImage: "/catalog/safety/pages/page-07.jpg" },
  "sa-002": { productImage: "/catalog/safety/products/p07-04.jpg", pageImage: "/catalog/safety/pages/page-07.jpg" },

  // ── Page 8 ─────────────────────────────────────────────────────────────
  "sa-003": { productImage: "/catalog/safety/products/p08-04.jpg", pageImage: "/catalog/safety/pages/page-08.jpg" },

  // ── Page 9 ─────────────────────────────────────────────────────────────
  "sa-004": { productImage: "/catalog/safety/products/p09-02.jpg", pageImage: "/catalog/safety/pages/page-09.jpg" },
  "sa-005": { productImage: "/catalog/safety/products/p09-00.jpg", pageImage: "/catalog/safety/pages/page-09.jpg" },

  // ── Page 10 ────────────────────────────────────────────────────────────
  "sa-006": { productImage: "/catalog/safety/products/p10-05.jpg", pageImage: "/catalog/safety/pages/page-10.jpg" },
  "sa-007": { productImage: "/catalog/safety/products/p10-01.jpg", pageImage: "/catalog/safety/pages/page-10.jpg" },

  // ── Page 11 ────────────────────────────────────────────────────────────
  "sa-008": { productImage: "/catalog/safety/products/p11-01.jpg", pageImage: "/catalog/safety/pages/page-11.jpg" },
  "sa-009": { productImage: "/catalog/safety/products/p11-03.jpg", pageImage: "/catalog/safety/pages/page-11.jpg" },

  // ── Page 12 ────────────────────────────────────────────────────────────
  "sa-010": { productImage: "/catalog/safety/products/p12-01.jpg", pageImage: "/catalog/safety/pages/page-12.jpg" },
  "sa-011": { productImage: "/catalog/safety/products/p12-02.jpg", pageImage: "/catalog/safety/pages/page-12.jpg" },
  "sa-012": { productImage: "/catalog/safety/products/p12-04.jpg", pageImage: "/catalog/safety/pages/page-12.jpg" },
  "sa-013": { productImage: "/catalog/safety/products/p12-03.jpg", pageImage: "/catalog/safety/pages/page-12.jpg" },

  // ── Page 13 ────────────────────────────────────────────────────────────
  "sa-014": { productImage: "/catalog/safety/products/p13-06.jpg", pageImage: "/catalog/safety/pages/page-13.jpg" },
  "sa-015": { productImage: "/catalog/safety/products/p13-07.jpg", pageImage: "/catalog/safety/pages/page-13.jpg" },

  // ── Page 14 ────────────────────────────────────────────────────────────
  "sa-016": { productImage: "/catalog/safety/products/p14-01.jpg", pageImage: "/catalog/safety/pages/page-14.jpg" },
  "sa-017": { productImage: "/catalog/safety/products/p14-05.jpg", pageImage: "/catalog/safety/pages/page-14.jpg" },
  "sa-018": { productImage: "/catalog/safety/products/p14-03.jpg", pageImage: "/catalog/safety/pages/page-14.jpg" },
  "sa-019": { productImage: "/catalog/safety/products/p14-04.jpg", pageImage: "/catalog/safety/pages/page-14.jpg" },

  // ── Page 15 ────────────────────────────────────────────────────────────
  "sa-020": { productImage: "/catalog/safety/products/p15-01.jpg", pageImage: "/catalog/safety/pages/page-15.jpg" },
  "sa-021": { productImage: "/catalog/safety/products/p15-02.jpg", pageImage: "/catalog/safety/pages/page-15.jpg" },

  // ── Page 16 ────────────────────────────────────────────────────────────
  "sa-022": { productImage: "/catalog/safety/products/p16-00.jpg", pageImage: "/catalog/safety/pages/page-16.jpg" },
  "sa-023": { productImage: "/catalog/safety/products/p16-03.jpg", pageImage: "/catalog/safety/pages/page-16.jpg" },
  "sa-024": { productImage: "/catalog/safety/products/p16-02.jpg", pageImage: "/catalog/safety/pages/page-16.jpg" },
  "sa-025": { productImage: "/catalog/safety/products/p16-10.jpg", pageImage: "/catalog/safety/pages/page-16.jpg" },

  // ── Page 17 ────────────────────────────────────────────────────────────
  "sa-026": { productImage: "/catalog/safety/products/p17-03.jpg", pageImage: "/catalog/safety/pages/page-17.jpg" },
  "sa-027": { productImage: "/catalog/safety/products/p17-02.jpg", pageImage: "/catalog/safety/pages/page-17.jpg" },
  "sa-028": { productImage: "/catalog/safety/products/p17-05.jpg", pageImage: "/catalog/safety/pages/page-17.jpg" },
  "sa-029": { productImage: "/catalog/safety/products/p17-06.jpg", pageImage: "/catalog/safety/pages/page-17.jpg" },

  // ── Page 18 ────────────────────────────────────────────────────────────
  "sa-030": { productImage: "/catalog/safety/products/p18-02.jpg", pageImage: "/catalog/safety/pages/page-18.jpg" },
  "sa-031": { productImage: "/catalog/safety/products/p18-01.jpg", pageImage: "/catalog/safety/pages/page-18.jpg" },
  "sa-032": { productImage: "/catalog/safety/products/p18-00.jpg", pageImage: "/catalog/safety/pages/page-18.jpg" },
  "sa-033": { productImage: "/catalog/safety/products/p18-04.jpg", pageImage: "/catalog/safety/pages/page-18.jpg" },
  "sa-034": { productImage: "/catalog/safety/products/p18-06.jpg", pageImage: "/catalog/safety/pages/page-18.jpg" },

  // ── Page 19 ────────────────────────────────────────────────────────────
  "sa-035": { productImage: "/catalog/safety/products/p19-01.jpg", pageImage: "/catalog/safety/pages/page-19.jpg" },
  "sa-036": { productImage: "/catalog/safety/products/p19-02.jpg", pageImage: "/catalog/safety/pages/page-19.jpg" },

  // ── Page 20 ────────────────────────────────────────────────────────────
  "sa-037": { productImage: "/catalog/safety/products/p20-00.jpg", pageImage: "/catalog/safety/pages/page-20.jpg" },
};
