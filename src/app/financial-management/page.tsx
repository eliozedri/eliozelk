import { Suspense } from "react";
import FinancialManagement from "@/components/FinancialManagement";

export default function FinancialManagementPage() {
  return (
    <Suspense fallback={null}>
      <FinancialManagement />
    </Suspense>
  );
}
