import { Suspense } from "react";
import Fleet from "@/components/Fleet";

export default function FleetPage() {
  return (
    <Suspense fallback={null}>
      <Fleet />
    </Suspense>
  );
}
