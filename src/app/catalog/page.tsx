import { Suspense } from "react";
import { CatalogPage } from "@/components/Catalog";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CatalogPage />
    </Suspense>
  );
}
