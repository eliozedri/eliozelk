"use client";
/* eslint-disable @next/next/no-img-element -- attachment thumbnails use base64 dataURLs, incompatible with next/image */

import { useState, useRef, useMemo, useCallback, type ReactNode } from "react";
import { nanoid } from "nanoid";
import { useOrderForm } from "@/hooks/useOrderForm";
import type { OrderAttachment } from "@/types/order";
import { useOrdersContext } from "@/context/OrdersContext";
import { OrderHeader } from "./OrderHeader";
import { SignTable } from "./SignTable";
import { MiscSection } from "./MiscSection";
import { FormActions } from "./FormActions";
import type { OrderHeader as OrderHeaderType } from "@/types/order";
import type { OrderPriority } from "@/types/workOrder";
import { useDirtyGuard } from "@/context/NavigationGuardContext";

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 transition-all";

function RoadIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="11" y="2" width="14" height="32" rx="2" fill="#1e3a5f" />
      <rect x="16" y="5" width="4" height="6" rx="1" fill="white" />
      <rect x="16" y="15" width="4" height="6" rx="1" fill="white" />
      <rect x="16" y="25" width="4" height="6" rx="1" fill="white" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CollapsibleSection({ title, defaultOpen = true, badge, children }: {
  title: string;
  defaultOpen?: boolean;
  badge?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700">{title}</span>
          {badge !== undefined && badge > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
              {badge}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

function validate(order: ReturnType<typeof useOrderForm>["order"]): string | null {
  if (!order.orderType) return "נא לבחור את אופי ההזמנה";
  if (!order.date) return "נא להזין תאריך";
  if (!order.customer.trim()) return "נא להזין שם חברה";
  if (!order.city) return "נא לבחור עיר";
  if (!order.jobName?.trim()) return "נא להזין שם עבודה / אתר עבודה";

  const hasSign = order.signRows.some((r) => r.signNumber.trim());
  const hasSignage = (order.signsRows ?? []).some((r) => r.description.trim());
  const hasAccessory = (order.accessoryRows ?? []).some((r) => r.description.trim());
  const hasMisc = order.miscRows.some((r) => r.description.trim());
  const hasService = (order.serviceRows ?? []).some((r) => r.description.trim());
  if (!hasSign && !hasSignage && !hasAccessory && !hasMisc && !hasService) {
    return "נא להוסיף לפחות פריט אחד להזמנה";
  }

  for (const r of order.signRows) {
    if (r.signNumber.trim() && r.quantity !== "" && Number(r.quantity) <= 0) {
      return `כמות לא תקינה בשורת תמרור: ${r.signNumber}`;
    }
  }
  for (const r of [...(order.signsRows ?? []), ...(order.accessoryRows ?? []), ...order.miscRows, ...(order.serviceRows ?? [])]) {
    if (r.description.trim() && r.quantity !== "" && Number(r.quantity) <= 0) {
      return `כמות לא תקינה בפריט: ${r.description}`;
    }
  }
  return null;
}

export function OrderForm() {
  const {
    order,
    updateHeader,
    setFabricationRequired,
    addSignRow,
    updateSignRow,
    removeSignRow,
    addSignsRow,
    updateSignsRow,
    removeSignsRow,
    addAccessoryRow,
    updateAccessoryRow,
    removeAccessoryRow,
    addServiceRow,
    updateServiceRow,
    removeServiceRow,
    addMiscRow,
    updateMiscRow,
    removeMiscRow,
    updateFabrication,
    addAttachment,
    removeAttachment,
    resetOrder,
  } = useOrderForm();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const ALLOWED_TYPES = ["image/jpeg","image/png","image/gif","image/webp","image/svg+xml","application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/plain"];
  const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per file
  const MAX_TOTAL_BYTES = 15 * 1024 * 1024; // 15 MB total

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setFileError(null);

    const currentTotal = (order.attachments ?? []).reduce((s, a) => s + a.size, 0);
    let running = currentTotal;

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setFileError(`סוג קובץ לא נתמך: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setFileError(`הקובץ ${file.name} גדול מ-5MB`);
        continue;
      }
      if (running + file.size > MAX_TOTAL_BYTES) {
        setFileError("הגעת למגבלת 15MB לכלל הקבצים בהזמנה");
        break;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const attachment: OrderAttachment = { id: nanoid(), name: file.name, dataUrl, type: file.type, size: file.size };
        addAttachment(attachment);
      };
      reader.readAsDataURL(file);
      running += file.size;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function isImage(type: string) { return type.startsWith("image/"); }

  const { addOrder, updateOrderFields, deleteOrder } = useOrdersContext();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  // Track the DB draft ID so "שמור כטיוטה" updates rather than inserts on repeat calls
  const draftOrderIdRef = useRef<string | null>(null);

  // ── Dirty detection: form has meaningful data beyond the empty defaults ──
  const isDirty = useMemo(() => {
    if (order.customer.trim()) return true;
    if ((order.jobName ?? "").trim()) return true;
    if (order.city) return true;
    if (order.signRows.some(r => r.signNumber.trim())) return true;
    if (order.miscRows.some(r => r.description.trim())) return true;
    if ((order.signsRows ?? []).some(r => r.description.trim())) return true;
    if ((order.accessoryRows ?? []).some(r => r.description.trim())) return true;
    if ((order.serviceRows ?? []).some(r => r.description.trim())) return true;
    return false;
  }, [order]);

  // "Save as draft" for guard: create a DB record with status "draft" on first call,
  // update it on subsequent calls so the user can recover the order from the orders list.
  const handleSaveDraftForGuard = useCallback(async () => {
    if (draftOrderIdRef.current) {
      // Already saved once — update existing draft
      await updateOrderFields(draftOrderIdRef.current, {
        customer: order.customer,
        jobName: order.jobName ?? null,
        city: order.city ?? "",
        signRows: order.signRows,
        miscRows: order.miscRows,
        signsRows: order.signsRows ?? [],
        accessoryRows: order.accessoryRows ?? [],
        serviceRows: order.serviceRows ?? [],
        generalNotes: order.generalNotes || undefined,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const draft = await addOrder(order, "normal", { asDraft: true });
      draftOrderIdRef.current = draft.id;
    }
  }, [order, addOrder, updateOrderFields]);

  // "Discard" for guard: delete the DB draft (if created) and reset the form
  const handleDiscardForGuard = useCallback(async () => {
    if (draftOrderIdRef.current) {
      await deleteOrder(draftOrderIdRef.current);
      draftOrderIdRef.current = null;
    }
    resetOrder();
  }, [resetOrder, deleteOrder]);

  // Register dirty guard — only when form has data and no success shown (not submitted)
  useDirtyGuard({
    isDirty: isDirty && !successMessage,
    onSaveDraft: handleSaveDraftForGuard,
    onDiscard: handleDiscardForGuard,
  });

  const handleSubmit = async (priority: OrderPriority) => {
    const err = validate(order);
    if (err) {
      setValidationError(err);
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    // If a draft was saved while guard was pending, delete it — the real order replaces it
    if (draftOrderIdRef.current) {
      await deleteOrder(draftOrderIdRef.current);
      draftOrderIdRef.current = null;
    }
    const submitted = await addOrder(order, priority);
    resetOrder();
    const typeMsg = submitted.status === "graphics_pending"
      ? "ההזמנה נשלחה למחלקת גרפיקה"
      : submitted.orderType === "pickup"
      ? "הזמנת האיסוף נפתחה — מועברת להכנה"
      : submitted.orderType === "equipment_supply"
      ? "הזמנת הציוד נפתחה — מועברת להכנה"
      : "ההזמנה נפתחה";
    setSuccessMessage(`${typeMsg} — מספר הזמנה: ${submitted.orderNumber}`);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  return (
    <div className="min-h-screen bg-surface py-6 px-4">
      <div className="max-w-4xl mx-auto">

        <div className="flex items-center gap-3 mb-5 no-print">
          <div>
            <div className="text-2xl font-black text-[#1e3a5f] leading-tight">אלקיים</div>
            <div className="text-xs text-gray-500 leading-tight">סימון כבישים בע״מ</div>
          </div>
          <RoadIcon />
        </div>

        <div className="flex items-center gap-2 mb-5">
          <h1 className="text-2xl font-bold text-gray-900">פתיחת הזמנה חדשה</h1>
          <svg className="w-7 h-7 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
        </div>

        {validationError && (
          <div className="flex items-center gap-3 mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium no-print">
            <svg className="w-5 h-5 shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{validationError}</span>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-3 mb-5 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm font-medium no-print">
            <CheckIcon />
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="mr-auto text-green-600 hover:text-green-800 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        )}

        {/* ── אופי ההזמנה (required) ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-4">
          <p className="text-sm font-bold text-gray-700 mb-3">
            אופי ההזמנה
            <span className="text-red-500 mr-1">*</span>
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(["field_work", "pickup", "equipment_supply"] as const).map((type) => {
              const labels = {
                field_work:       { title: "ביצוע עבודה",    icon: "🚧", hint: "ביצוע עבודת שטח על ידי צוות אלקיים" },
                pickup:           { title: "הזמנה לאיסוף",   icon: "📦", hint: "הלקוח יגיע לאסוף את הפריטים" },
                equipment_supply: { title: "אספקת ציוד",     icon: "🚚", hint: "אספקת ציוד/מוצרים ללקוח" },
              };
              const { title, icon, hint } = labels[type];
              const selected = order.orderType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateHeader({ orderType: type, fulfillmentMethod: type === "equipment_supply" ? "delivery" : undefined, awaitingCustomerApproval: false })}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-right transition-all ${
                    selected
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <span className="text-xl">{icon}</span>
                  <span className={`text-sm font-bold ${selected ? "text-blue-700" : "text-gray-700"}`}>{title}</span>
                  <span className="text-[11px] text-gray-400 leading-snug">{hint}</span>
                </button>
              );
            })}
          </div>

          {/* Helper text per type */}
          {order.orderType === "pickup" && (
            <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              הזמנה זו לא תיכנס לסידור השבועי. לאחר הכנה היא תעבור לתיאום איסוף מול הלקוח.
            </p>
          )}
          {order.orderType === "equipment_supply" && (
            <p className="mt-3 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
              לאחר הכנת הציוד, ההזמנה תיכנס לשיבוץ בסידור השבועי לתיאום האספקה.
            </p>
          )}
          {order.orderType === "field_work" && !order.awaitingCustomerApproval && (
            <p className="mt-3 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
              הזמנה זו תעבור לשיבוץ בסידור השבועי לאחר השלמת ההכנות ואישור הלקוח.
            </p>
          )}

          {/* Standby / customer approval checkbox — field_work only */}
          {order.orderType === "field_work" && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={order.awaitingCustomerApproval ?? false}
                  onChange={(e) => updateHeader({ awaitingCustomerApproval: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                />
                <div>
                  <span className="text-sm font-semibold text-gray-700">ממתין לאישור לקוח — עבודה בסטנד ביי</span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    הזמנה זו היא עבודה עתידית. היא לא תיכנס לסידור השבועי עד שאישור הלקוח יתקבל במשרד.
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>

        <OrderHeader
          header={{
            date: order.date,
            customer: order.customer,
            contactPerson: order.contactPerson,
            orderedBy: order.orderedBy,
            city: order.city,
          }}
          onChange={(partial) => updateHeader(partial as Partial<OrderHeaderType>)}
        />

        {/* שם עבודה + מועד ספקה + מקום עבודה — available for all order types */}
        {order.orderType && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                שם עבודה / אתר עבודה <span className="text-red-500">*</span>
                {order.orderType === "field_work" && (
                  <span className="text-gray-400 font-normal mr-1">(לזיהוי בסידור השבועי)</span>
                )}
              </label>
              <input
                type="text"
                value={order.jobName ?? ""}
                onChange={(e) => updateHeader({ jobName: e.target.value })}
                className={inputCls}
                placeholder="לדוג׳: סימון חניון עיריית אשקלון"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                מועד ספקה נדרש
                <span className="text-gray-400 font-normal mr-1">(אופציונלי)</span>
              </label>
              <input
                type="date"
                value={order.requiredDate ?? ""}
                onChange={(e) => updateHeader({ requiredDate: e.target.value })}
                className={inputCls}
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">מיקום / כתובת</label>
              <input
                type="text"
                value={order.location ?? ""}
                onChange={(e) => updateHeader({ location: e.target.value })}
                className={inputCls}
                placeholder="לדוג׳: רחוב הרצל 12, אשקלון"
              />
            </div>
          </div>
        )}

        <SignTable
          rows={order.signRows}
          onAdd={addSignRow}
          onUpdate={updateSignRow}
          onRemove={removeSignRow}
        />

        <MiscSection
          rows={order.miscRows}
          onAdd={addMiscRow}
          onUpdate={updateMiscRow}
          onRemove={removeMiscRow}
          title="שלט לפי מידה"
          accentColor="bg-amber-50"
          showDimensionRows
          alwaysShowDimensions
        />

        <CollapsibleSection
          title="שלטים ושילוט"
          defaultOpen={false}
          badge={(order.signsRows ?? []).filter(r => r.description.trim()).length || undefined}
        >
          <MiscSection
            rows={order.signsRows ?? []}
            onAdd={addSignsRow}
            onUpdate={updateSignsRow}
            onRemove={removeSignsRow}
            title="שלטים ושילוט"
            accentColor="bg-blue-50"
            allowedCatalogTypes={["product"]}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="אביזרים"
          defaultOpen={false}
          badge={(order.accessoryRows ?? []).filter(r => r.description.trim()).length || undefined}
        >
          <MiscSection
            rows={order.accessoryRows ?? []}
            onAdd={addAccessoryRow}
            onUpdate={updateAccessoryRow}
            onRemove={removeAccessoryRow}
            title="אביזרים"
            accentColor="bg-teal-50"
            allowedCatalogTypes={["product", "material", "equipment"]}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="מוצרים ושירותים נוספים"
          defaultOpen={false}
          badge={(order.serviceRows ?? []).filter(r => r.description.trim()).length || undefined}
        >
          <MiscSection
            rows={order.serviceRows ?? []}
            onAdd={addServiceRow}
            onUpdate={updateServiceRow}
            onRemove={removeServiceRow}
            title="מוצרים ושירותים נוספים"
            accentColor="bg-purple-50"
            allowedCatalogTypes={["service", "labor", "misc", "equipment"]}
          />
        </CollapsibleSection>

        {/* General notes */}
        <CollapsibleSection
          title="הערות כלליות"
          defaultOpen={!!(order.generalNotes)}
        >
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 mb-4">
          <textarea
            value={order.generalNotes}
            onChange={(e) => updateHeader({ generalNotes: e.target.value })}
            placeholder="הערות, הנחיות מיוחדות, מידע נוסף..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400 resize-none"
          />
        </div>
        </CollapsibleSection>

        {/* File attachments */}
        <CollapsibleSection
          title="קבצים מצורפים"
          defaultOpen={false}
          badge={(order.attachments ?? []).length || undefined}
        >
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">קבצים מצורפים</label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-400 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              צרף קובץ
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
          {fileError && <p className="text-xs text-red-600 mb-2">{fileError}</p>}
          {(order.attachments ?? []).length === 0 ? (
            <p className="text-xs text-gray-400">לא צורפו קבצים · תמיכה ב-PDF, תמונות, Word, Excel (עד 5MB לקובץ)</p>
          ) : (
            <ul className="space-y-1.5">
              {(order.attachments ?? []).map((att) => (
                <li key={att.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  {isImage(att.type) ? (
                    <img src={att.dataUrl} alt={att.name} className="w-8 h-8 object-cover rounded border border-gray-200 shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded border border-gray-200 bg-white flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                  )}
                  <span className="flex-1 text-xs text-gray-700 truncate">{att.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{formatBytes(att.size)}</span>
                  <button type="button" onClick={() => removeAttachment(att.id)} className="shrink-0 text-gray-300 hover:text-red-500 transition-colors" title="הסר">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        </CollapsibleSection>

        {/* Fabrication */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4 mb-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={order.fabricationRequired}
              onChange={(e) => setFabricationRequired(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
            />
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              <span className="text-sm font-semibold text-gray-800">האם דרושה עבודת מסגרות?</span>
            </div>
          </label>

          {order.fabricationRequired && (
            <div className="mt-4 p-4 rounded-lg bg-orange-50 border border-orange-200 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="col-span-2 md:col-span-3">
                <label className="text-xs font-medium text-gray-600 block mb-1">תיאור העבודה</label>
                <input
                  type="text"
                  value={order.fabricationDetails.description}
                  onChange={(e) => updateFabrication({ description: e.target.value })}
                  placeholder="תיאור עבודת המסגרות"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">רוחב (ס&quot;מ)</label>
                <input type="number" min="0" value={order.fabricationDetails.width}
                  onChange={(e) => updateFabrication({ width: e.target.value })}
                  placeholder="0" className={`${inputCls} text-center`} dir="ltr" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">גובה (ס&quot;מ)</label>
                <input type="number" min="0" value={order.fabricationDetails.height}
                  onChange={(e) => updateFabrication({ height: e.target.value })}
                  placeholder="0" className={`${inputCls} text-center`} dir="ltr" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">כמות</label>
                <input type="number" min="0" value={order.fabricationDetails.quantity}
                  onChange={(e) => updateFabrication({ quantity: e.target.value })}
                  placeholder="0" className={`${inputCls} text-center`} dir="ltr" />
              </div>
              <div className="col-span-2 md:col-span-3">
                <label className="text-xs font-medium text-gray-600 block mb-1">חומר</label>
                <input type="text" value={order.fabricationDetails.material}
                  onChange={(e) => updateFabrication({ material: e.target.value })}
                  placeholder="סוג חומר (למשל: אלומיניום, פלדה...)" className={inputCls} />
              </div>
              <div className="col-span-2 md:col-span-3">
                <label className="text-xs font-medium text-gray-600 block mb-1">הערות מסגרות</label>
                <input type="text" value={order.fabricationDetails.notes}
                  onChange={(e) => updateFabrication({ notes: e.target.value })}
                  placeholder="הערות נוספות לעבודת המסגרות" className={inputCls} />
              </div>
            </div>
          )}
        </div>

        <FormActions order={order} onReset={resetOrder} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
