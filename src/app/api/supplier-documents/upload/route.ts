// File upload route for supplier documents.
// Accepts multipart/form-data, stores file in Supabase Storage,
// creates a supplier_document record, and returns the document ID.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAction } from "@/lib/auth/apiAuth";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import {
  classifyDocumentType,
  suggestCategory,
  suggestInventoryAction,
} from "@/lib/supplierDocuments/classification";
import {
  USER_CARD_DEFAULT_TYPE,
  USER_CARD_LABELS,
  DOCUMENT_TYPE_LABELS,
  isTypeMismatch,
} from "@/types/supplierDocument";
import type { UserDocumentCard } from "@/types/supplierDocument";
import { runDuplicateCheck } from "@/lib/supplierDocuments/duplicateCheck";
import { suggestExpenseType } from "@/types/financial";
import { validateUploadSignature } from "@/lib/upload/fileValidation";

// OCR runs synchronously inside this request (tesseract.js cold start downloads a
// WASM core + Hebrew LSTM models). Raise the budget so the function is not killed
// mid-OCR — a kill would strand the row in the "extracting" state forever.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUCKET = "supplier-documents";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/heic",
  "image/heif",
]);

async function ensureBucket(db: ReturnType<typeof getServiceSupabase>): Promise<void> {
  const { data: buckets } = await db.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);
  if (!exists) {
    await db.storage.createBucket(BUCKET, {
      public: false,
      allowedMimeTypes: Array.from(ALLOWED_TYPES),
      fileSizeLimit: MAX_FILE_SIZE,
    });
  }
}

// Best-effort: emit ONE prioritized finance notification via the existing
// notification foundation. Never throws — a failed notification must not fail
// the document upload.
async function emitFinanceNotification(
  db: ReturnType<typeof getServiceSupabase>,
  docId: string,
  opts: { isDuplicate: boolean; needsClassification: boolean; supplierName: string; total?: number; equipmentId: string | null },
): Promise<void> {
  const eventType = opts.isDuplicate
    ? "finance.duplicate_suspected"
    : opts.needsClassification
      ? "finance.needs_classification"
      : "finance.document_new";
  try {
    await db.rpc("fn_emit_notification", {
      p_event_type:  eventType,
      p_entity_type: "supplier_document",
      p_entity_id:   docId,
      p_created_by:  null,
      p_metadata:    { supplier: opts.supplierName, total: opts.total ?? null, equipment_id: opts.equipmentId },
    });
  } catch {
    // swallow — notifications are best-effort
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAction(req, "upload_supplier_document");
  if (!auth.ok) return auth.response;

  const db = getServiceSupabase();
  const { data: profile } = await db
    .from("profiles")
    .select("name")
    .eq("id", auth.user.id)
    .single();
  const createdBy = (profile as { name?: string } | null)?.name ?? auth.user.id;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "לא ניתן לקרוא את הקובץ" }, { status: 400 });
  }

  const selectedDocumentType = (formData.get("selectedDocumentType") as UserDocumentCard | null) || null;
  const hintType = selectedDocumentType ? USER_CARD_DEFAULT_TYPE[selectedDocumentType] : undefined;

  // Fleet ↔ finance link + classification (optional — set when uploaded from a vehicle/machine card)
  const equipmentId        = (formData.get("equipmentId") as string | null)?.trim() || null;
  const uploadSource       = (formData.get("uploadSource") as string | null)?.trim() || "general_scan";
  const linkedMaintenanceId = (formData.get("linkedMaintenanceId") as string | null)?.trim() || null;
  const linkedIncidentId   = (formData.get("linkedIncidentId") as string | null)?.trim() || null;
  const expenseType        = (formData.get("expenseType") as string | null)?.trim() || null;
  const businessArea       = (formData.get("businessArea") as string | null)?.trim() || (equipmentId ? "fleet" : null);

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `סוג קובץ לא נתמך: ${file.type}. נתמך: PDF, JPEG, PNG, WEBP, TIFF, HEIC` },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `קובץ גדול מדי (${Math.round(file.size / 1024 / 1024)}MB). מקסימום: 20MB` },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Content-signature check (defense-in-depth vs MIME spoofing) — reject
  // executables/archives/HTML/script disguised as a document.
  const sig = validateUploadSignature(buffer);
  if (!sig.ok) {
    return NextResponse.json({ error: sig.reason }, { status: 400 });
  }

  // Compute SHA-256 for duplicate detection
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  // Check for exact duplicate by hash before storing
  const { data: existing } = await db
    .from("supplier_documents")
    .select("id,status,document_number,supplier_name_raw")
    .eq("file_hash", fileHash)
    .not("status", "in", '("rejected","archived")')
    .limit(1)
    .single();

  if (existing) {
    const ex = existing as { id: string; status: string; document_number: string; supplier_name_raw: string };
    return NextResponse.json(
      {
        error: "קובץ זהה כבר קיים במערכת",
        existingDocumentId: ex.id,
        existingStatus: ex.status,
        existingDocNumber: ex.document_number,
      },
      { status: 409 }
    );
  }

  // Ensure bucket exists
  await ensureBucket(db);

  const docId = nanoid();
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `${new Date().getFullYear()}/${docId}.${ext}`;

  // Upload to Supabase Storage
  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: `שגיאה בהעלאת קובץ: ${uploadErr.message}` },
      { status: 500 }
    );
  }

  // Get public/signed URL
  const { data: urlData } = await db.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year

  const fileUrl = urlData?.signedUrl ?? null;

  // Try basic text classification from filename
  const filenameText = file.name.toLowerCase();
  const classification = classifyDocumentType(filenameText);

  const now = new Date().toISOString();

  // Create document record — starts in "extracting" while OCR runs
  const { error: insertErr } = await db.from("supplier_documents").insert({
    id:            docId,
    status:        "extracting",
    document_type: classification.type,
    supplier_name_raw: "",
    supplier_vat_raw:  "",
    document_number:   "",
    currency:      "ILS",
    payment_status: "unpaid",
    linked_order_ref: "",
    notes:         "",
    file_url:      fileUrl,
    file_name:     file.name,
    file_type:     file.type,
    file_hash:     fileHash,
    extraction_confidence: classification.confidence,
    extraction_notes: "מעבד מסמך — OCR בביצוע",
    equipment_id:  equipmentId,
    upload_source: uploadSource,
    linked_maintenance_id: linkedMaintenanceId,
    linked_incident_id: linkedIncidentId,
    expense_type:  expenseType,
    business_area: businessArea,
    requires_classification: !expenseType,
    created_by:    createdBy,
    created_at:    now,
    updated_at:    now,
  });

  if (insertErr) {
    await db.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Run OCR pipeline synchronously (15–30 s acceptable for internal tool)
  try {
    const { extractDocument } = await import("@/lib/supplierDocuments/ocrAdapter");
    const extraction = await extractDocument({
      fileBuffer: buffer,
      fileName: file.name,
      fileType: file.type,
      documentTypeHint: hintType,
    });

    // Technical failure detail goes to logs only — never raw to the user.
    if (extraction.rawError) {
      console.warn(`[supplier-documents/upload] doc ${docId} OCR provider=${extraction.provider} fallback=${extraction.fallbackUsed ?? false} rawError=${extraction.rawError}`);
    }

    const ocrUpdate: Record<string, unknown> = {
      status: "draft_ready",
      updated_at: new Date().toISOString(),
    };

    if (extraction.available && extraction.header) {
      const h = extraction.header;
      ocrUpdate.document_type        = h.documentType;
      ocrUpdate.supplier_name_raw    = h.supplierName ?? "";
      ocrUpdate.supplier_vat_raw     = h.supplierVat ?? "";
      ocrUpdate.document_number      = h.documentNumber ?? "";
      if (h.documentDate)            ocrUpdate.document_date = h.documentDate;
      ocrUpdate.currency             = h.currency;
      if (h.subtotalBeforeVat != null) ocrUpdate.subtotal_before_vat = h.subtotalBeforeVat;
      if (h.vatAmount != null)         ocrUpdate.vat_amount = h.vatAmount;
      if (h.totalAfterVat != null)     ocrUpdate.total_after_vat = h.totalAfterVat;
      ocrUpdate.extraction_confidence = h.confidence;
      const fieldWarnings = extraction.fieldWarnings ?? [];
      ocrUpdate.extraction_notes =
        fieldWarnings.length > 0
          ? `${h.notes ?? "OCR הושלם"} · ${fieldWarnings.join(" · ")}`
          : (h.notes ?? "OCR הושלם");
      const mismatchWarning =
        selectedDocumentType &&
        h.documentType !== "unknown" &&
        isTypeMismatch(selectedDocumentType, h.documentType)
          ? `OCR זיהה "${DOCUMENT_TYPE_LABELS[h.documentType]}" — נבחר כרטיס "${USER_CARD_LABELS[selectedDocumentType]}"`
          : undefined;
      ocrUpdate.parsed_json = {
        ...(h as unknown as Record<string, unknown>),
        ...(selectedDocumentType ? { selectedDocumentType } : {}),
        detectedDocumentType: h.documentType,
        ...(mismatchWarning ? { typeMismatchWarning: mismatchWarning } : {}),
        // ── Engine-upgrade metadata (audit + review hints) ──
        ...(extraction.vehicle ? { vehicle: extraction.vehicle } : {}),
        ...(fieldWarnings.length > 0 ? { fieldWarnings } : {}),
        ...(extraction.vatValid != null ? { vatValid: extraction.vatValid } : {}),
        ...(extraction.lowConfidenceTerms && extraction.lowConfidenceTerms.length > 0
          ? { lowConfidenceTerms: extraction.lowConfidenceTerms }
          : {}),
        ...(extraction.pageConfidence != null ? { ocrPageConfidence: extraction.pageConfidence } : {}),
        ...(extraction.scanned != null ? { scannedPdf: extraction.scanned } : {}),
        ...(extraction.engine ? { ocrEngine: extraction.engine } : {}),
        // ── Provider transparency (which engine, fallback, failure reason) ──
        ...(extraction.provider ? { ocrProvider: extraction.provider } : {}),
        ...(extraction.fallbackUsed ? { ocrFallbackUsed: true } : {}),
        ...(extraction.userError ? { ocrUserError: extraction.userError } : {}),
        ...(extraction.manualReviewReason ? { ocrManualReviewReason: extraction.manualReviewReason } : {}),
      };
      // Surface the manual-review reason in the human-readable notes too.
      if (extraction.manualReviewReason) {
        ocrUpdate.extraction_notes = `${ocrUpdate.extraction_notes} · ${extraction.manualReviewReason}`;
      }
    } else {
      ocrUpdate.extraction_confidence = 0;
      ocrUpdate.extraction_notes      = extraction.userError ?? extraction.error ?? "OCR נכשל — יש להזין נתונים ידנית";
      ocrUpdate.parsed_json = {
        ...(selectedDocumentType ? { selectedDocumentType } : {}),
        detectedDocumentType: "unknown",
        ...(extraction.provider ? { ocrProvider: extraction.provider } : {}),
        ...(extraction.fallbackUsed ? { ocrFallbackUsed: true } : {}),
        ...(extraction.manualReviewReason ? { ocrManualReviewReason: extraction.manualReviewReason } : {}),
      };
    }

    if (extraction.rawText) ocrUpdate.raw_text = extraction.rawText;

    await db.from("supplier_documents").update(ocrUpdate).eq("id", docId);

    // Insert extracted line items if parser found any
    if (extraction.lines && extraction.lines.length > 0) {
      const lineNow = new Date().toISOString();
      const lineRows = extraction.lines.map(l => {
        const cat    = suggestCategory(l.originalDescription);
        const action = suggestInventoryAction(l.originalDescription, cat.category);
        return {
          id:                   nanoid(),
          document_id:          docId,
          line_number:          l.lineNumber,
          original_description: l.originalDescription,
          normalized_description: l.originalDescription,
          supplier_sku:         l.supplierSku || "",
          quantity:             l.quantity ?? null,
          unit_of_measure:      l.unitOfMeasure,
          unit_price:           l.unitPrice ?? null,
          line_total:           l.lineTotal ?? null,
          category:             cat.category,
          inventory_action:     action.action,
          status:               "extracted",
          confidence_score:     l.confidence,
          warning_flags:        l.warnings ?? [],
          created_at:           lineNow,
          updated_at:           lineNow,
        };
      });
      await db.from("supplier_document_lines").insert(lineRows);
    }

    // ── Auto-suggest expense type when not provided (never silently guess if unsure) ──
    let needsClassification = !expenseType;
    if (!expenseType) {
      const guess = suggestExpenseType(
        [
          (ocrUpdate.supplier_name_raw as string) ?? "",
          (ocrUpdate.document_type as string) ?? "",
          extraction.rawText ?? "",
        ].join(" ")
      );
      if (guess) {
        await db.from("supplier_documents")
          .update({ expense_type: guess, requires_classification: false })
          .eq("id", docId);
        needsClassification = false;
      }
      // else: requires_classification stays true → surfaces in הנהלת כספים "דורש סיווג"
    }

    // ── Cross-system duplicate detection (against ALL financial documents) ──
    const dup = await runDuplicateCheck(db, {
      documentId:      docId,
      fileHash:        fileHash,
      supplierNameRaw: (ocrUpdate.supplier_name_raw as string) ?? "",
      documentNumber:  (ocrUpdate.document_number as string) ?? "",
      documentDate:    (ocrUpdate.document_date as string) ?? undefined,
      totalAfterVat:   (ocrUpdate.total_after_vat as number) ?? undefined,
    });
    const isDuplicate = dup.hasDuplicate && dup.candidates.some(c => c.matchScore >= 0.9);
    if (isDuplicate) {
      await db.from("supplier_documents")
        .update({ status: "duplicate_suspected", updated_at: new Date().toISOString() })
        .eq("id", docId);
    }

    // ── Emit ONE prioritized finance notification (bell/center) ──
    await emitFinanceNotification(db, docId, {
      isDuplicate,
      needsClassification,
      supplierName: (ocrUpdate.supplier_name_raw as string) ?? "",
      total:        (ocrUpdate.total_after_vat as number) ?? undefined,
      equipmentId,
    });
  } catch (err) {
    // Unexpected OCR crash — still open the review screen so user can fill manually
    await db.from("supplier_documents").update({
      status: "draft_ready",
      extraction_confidence: 0,
      extraction_notes: `שגיאה ב-OCR: ${err instanceof Error ? err.message : String(err)}`,
      updated_at: new Date().toISOString(),
    }).eq("id", docId);
  }

  return NextResponse.json({ id: docId, fileUrl }, { status: 201 });
}
