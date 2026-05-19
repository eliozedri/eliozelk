"use client";

export type DiaryTab = "header" | "painting" | "poles" | "security" | "additional" | "docs" | "profitability";

const ALL_TABS: { id: DiaryTab; label: string }[] = [
  { id: "header", label: "פרטי עבודה" },
  { id: "painting", label: "צביעה" },
  { id: "poles", label: "עמודים ותמרורים" },
  { id: "security", label: "צוותי אבטחה" },
  { id: "additional", label: "צוותים וכלים" },
  { id: "docs", label: "תיעוד" },
  { id: "profitability", label: "רווחיות" },
];

interface Props {
  active: DiaryTab;
  onChange: (tab: DiaryTab) => void;
}

export function TabBar({ active, onChange }: Props) {
  const tabs = ALL_TABS;
  return (
    <div className="flex border-b border-gray-200 bg-white overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            active === tab.id
              ? "border-blue-600 text-blue-700 bg-blue-50/40"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
