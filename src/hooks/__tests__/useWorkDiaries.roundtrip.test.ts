import { describe, it, expect } from "vitest";
import { fromRow, toRow } from "@/hooks/useWorkDiaries";
import { createEmptyDiary } from "@/types/workDiary";
import type { WorkDiary } from "@/types/workDiary";

// Regression guard for the reported "work-diary draft loses its products on
// reopen" bug. The line-item arrays (paintingItems/poleItems/signItems/photos)
// live only inside the JSONB `data` blob, so they must survive the full
// save -> load -> edit -> save -> load cycle, and must never hydrate as
// undefined (which blanks the item tabs via .map on undefined).

function diaryWithItems(): WorkDiary {
  const d = createEmptyDiary("WD-2026-001");
  return {
    ...d,
    customerName: "אוליצקי",
    siteName: "רכבת אשדוד",
    paintingItems: [
      { id: "p1", description: "קו הפרדה", unit: "מ\"א", quantity: 120 } as never,
    ],
    poleItems: [
      { id: "po1", type: "עמוד", quantity: 4 } as never,
    ],
    signItems: [
      { id: "s1", signNumber: "ב-37", quantity: 2 } as never,
    ],
  };
}

describe("work-diary draft persistence round-trip", () => {
  it("preserves all line-item arrays through save -> load", () => {
    const diary = diaryWithItems();
    const row = toRow(diary) as Record<string, unknown>;

    // The blob carries the items.
    expect((row.data as WorkDiary).paintingItems).toHaveLength(1);

    const recovered = fromRow(row);
    expect(recovered.paintingItems).toEqual(diary.paintingItems);
    expect(recovered.poleItems).toEqual(diary.poleItems);
    expect(recovered.signItems).toEqual(diary.signItems);
    expect(recovered.diaryNumber).toBe("WD-2026-001");
    expect(recovered.customerName).toBe("אוליצקי");
  });

  it("survives a reopen -> edit -> save -> reopen cycle", () => {
    const diary = diaryWithItems();
    // First save + reopen
    const reopened = fromRow(toRow(diary) as Record<string, unknown>);
    // Edit: add a painting line
    const edited: WorkDiary = {
      ...reopened,
      paintingItems: [
        ...reopened.paintingItems,
        { id: "p2", description: "חץ", unit: "יח'", quantity: 3 } as never,
      ],
    };
    // Save + reopen again
    const reopenedAgain = fromRow(toRow(edited) as Record<string, unknown>);
    expect(reopenedAgain.paintingItems).toHaveLength(2);
    expect(reopenedAgain.paintingItems[1]).toMatchObject({ id: "p2", quantity: 3 });
  });

  it("defensively defaults missing item arrays to [] (legacy/partial rows)", () => {
    // A row whose blob predates the item-array keys must not hydrate undefined.
    const legacyRow: Record<string, unknown> = {
      id: "legacy-1",
      diary_number: "WD-2025-099",
      status: "draft",
      customer_name: "ישן",
      site_name: "אתר",
      execution_date: "2025-12-01",
      created_at: "2025-12-01T00:00:00.000Z",
      updated_at: "2025-12-01T00:00:00.000Z",
      data: { customerName: "ישן" }, // no paintingItems/poleItems/signItems/photos
    };
    const recovered = fromRow(legacyRow);
    expect(recovered.paintingItems).toEqual([]);
    expect(recovered.poleItems).toEqual([]);
    expect(recovered.signItems).toEqual([]);
    expect(recovered.photos).toEqual([]);
  });
});
