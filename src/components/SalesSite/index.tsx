"use client";

import { useMemo } from "react";
import type { CatalogItem } from "@/types/catalog";
import { useCatalogContext } from "@/context/CatalogContext";
import { isSellable, statusBucket } from "@/lib/catalog/sellable";
import { SalesHero } from "./SalesHero";
import { SalesStatsCards } from "./SalesStatsCards";
import { SalesProductPreviewGrid } from "./SalesProductPreviewGrid";
import { SalesFutureModules } from "./SalesFutureModules";

export function SalesSitePage() {
  const { items } = useCatalogContext();

  const { sellableItems, hiddenItems, awaitingReview } = useMemo(() => {
    const sellable: CatalogItem[] = [];
    const hidden: CatalogItem[] = [];
    let awaiting = 0;
    for (const item of items) {
      if (isSellable(item)) {
        sellable.push(item);
      } else {
        hidden.push(item);
        if (statusBucket(item) === "needs_review") awaiting += 1;
      }
    }
    return { sellableItems: sellable, hiddenItems: hidden, awaitingReview: awaiting };
  }, [items]);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <SalesHero sellableCount={sellableItems.length} />
        <SalesStatsCards
          sellable={sellableItems.length}
          hidden={hiddenItems.length}
          awaitingReview={awaitingReview}
        />
        <SalesProductPreviewGrid sellableItems={sellableItems} hiddenItems={hiddenItems} />
        <SalesFutureModules />
      </div>
    </div>
  );
}
