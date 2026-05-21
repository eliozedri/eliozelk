"use client";

import type { ShowcaseCategory } from "./constants";

interface Props {
  category: ShowcaseCategory;
  count: number;
  selected: boolean;
  onClick: () => void;
}

export function CategoryCard({ category, count, selected, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center text-center p-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        selected
          ? "bg-blue-900/30 border-blue-500 text-blue-300"
          : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20"
      }`}
    >
      <span className="text-2xl mb-1.5">{category.icon}</span>
      <span className="text-[11px] font-semibold leading-tight">{category.label}</span>
      <span className={`text-[9px] mt-1 ${selected ? "text-blue-400" : "text-white/30"}`}>
        {count} {count === 1 ? "מוצר" : "מוצרים"}
      </span>
    </button>
  );
}
