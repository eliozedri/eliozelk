"use client";

interface Props {
  uninvoicedCompleted: number;
  oldestUninvoicedDays: number;
  verifiedOrders: number;
  invoicedOrders: number;
  accountingPending: number;
  onAccountingClick: () => void;
}

interface BillingRow { label: string; value: number; color: string; }

function Row({ label, value, color }: BillingRow) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

export function AccountingBillingPanel({
  uninvoicedCompleted,
  oldestUninvoicedDays,
  verifiedOrders,
  invoicedOrders,
  accountingPending,
  onAccountingClick,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">חיוב וחשבונאות</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">הזמנות בטיפול פיננסי</p>
      </div>

      {uninvoicedCompleted === 0 ? (
        <div className="flex-1 flex items-center justify-center px-4 py-6">
          <p className="text-xs text-gray-400 text-center">✓ אין הזמנות ממתינות לחיוב</p>
        </div>
      ) : (
        <>
          <button
            onClick={onAccountingClick}
            className="flex flex-col items-center justify-center py-5 hover:bg-amber-50 transition-colors border-b border-gray-100 group"
          >
            <p className="text-4xl font-black text-amber-600 group-hover:text-amber-700 tabular-nums">{uninvoicedCompleted}</p>
            <p className="text-[11px] font-semibold text-gray-600 mt-1">הושלמו ולא חויבו</p>
            {oldestUninvoicedDays > 0 && (
              <p className="text-[10px] text-gray-400 mt-0.5">הישנה ביותר: {oldestUninvoicedDays} ימים</p>
            )}
          </button>
          <div className="px-4 py-2 flex-1">
            <Row label="ממתינות לאישור"      value={verifiedOrders}    color="text-amber-600" />
            <Row label="מאושרות לחיוב"       value={invoicedOrders}    color="text-blue-600" />
            <Row label="סה״כ בטיפול חשבונאי" value={accountingPending} color="text-gray-700" />
          </div>
        </>
      )}
    </div>
  );
}
