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

  it("preserves the FULL draft state (teams, security, notes, billing, time, photos, signature)", () => {
    const d = createEmptyDiary("WD-2026-050");
    const diary: WorkDiary = {
      ...d,
      customerName: "נתיבי ישראל",
      siteName: "כביש 6",
      contactName: "מאיר",
      contactPhone: "050-0000000",
      crewLeaderName: "אבי",
      crewMembers: ["דני", "יוסי", "רון"],
      generalNotes: "עבודת לילה, הוסט מסלול",
      // item-level quantities + notes
      paintingItems: [
        { id: "p1", name: "קו הפרדה", unit: "מ\"א", white: "120", orange: "", notes: "מקטע צפוני" } as never,
      ],
      poleItems: [{ id: "po1", name: "עמוד", unit: "יח׳", supply: "4", install: "4", notes: "" } as never],
      signItems: [{ id: "s1", regular: "2", install: "2", signSize: "60", notes: "ב-37" } as never],
      // teams
      securityTeams: {
        arrowBoards: [{ quantity: "2", notes: "צומת" }],
        inspectors: [{ quantity: "1", notes: "" }],
      },
      additionalTeams: {
        crane: { quantity: "1", notes: "הרמת שילוט" },
        sweeper: { quantity: "", notes: "" },
        other: [{ id: "o1", description: "גנרטור", quantity: "1", notes: "" }],
      },
      // billing + time + cost
      isBillable: true,
      billedAmount: 8500,
      billingNotes: "לפי הזמנה",
      travelTimeHours: 1.5,
      setupTimeHours: 0.5,
      executionTimeHours: 6,
      materialCost: 1200,
      // attachments + signature
      photos: [{ id: "ph1", url: "blob://x", caption: "לפני", takenAt: "2026-05-23T20:00:00.000Z" } as never],
      companySignature: {
        signerName: "אבי", signerRole: "מנהל עבודה", signerEmail: "a@x.co",
        location: "כביש 6", signedAt: "2026-05-23T22:00:00.000Z", dataUrl: "data:image/png;base64,AAAA",
      },
    };

    const recovered = fromRow(toRow(diary) as Record<string, unknown>);

    expect(recovered.crewMembers).toEqual(["דני", "יוסי", "רון"]);
    expect(recovered.generalNotes).toBe("עבודת לילה, הוסט מסלול");
    expect(recovered.paintingItems[0]).toMatchObject({ white: "120", notes: "מקטע צפוני" });
    expect(recovered.poleItems[0]).toMatchObject({ supply: "4", install: "4" });
    expect(recovered.signItems[0]).toMatchObject({ regular: "2", signSize: "60" });
    expect(recovered.securityTeams).toEqual(diary.securityTeams);
    expect(recovered.additionalTeams).toEqual(diary.additionalTeams);
    expect(recovered.isBillable).toBe(true);
    expect(recovered.billedAmount).toBe(8500);
    expect(recovered.billingNotes).toBe("לפי הזמנה");
    expect(recovered.travelTimeHours).toBe(1.5);
    expect(recovered.executionTimeHours).toBe(6);
    expect(recovered.materialCost).toBe(1200);
    expect(recovered.photos).toHaveLength(1);
    expect(recovered.photos[0]).toMatchObject({ caption: "לפני" });
    expect(recovered.companySignature?.dataUrl).toBe("data:image/png;base64,AAAA");
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
