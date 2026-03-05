import { describe, expect, it } from "bun:test";
import { applyStableCatalogOrder } from "../../src/lib/catalogStableOrder";

type Row = { id: string; rank: number };

describe("applyStableCatalogOrder", () => {
  it("keeps existing IDs in prior order across updates", () => {
    const prevOrder = ["m1", "m2", "m3"];
    const nextSortedRows: Row[] = [
      { id: "m3", rank: 1 },
      { id: "m2", rank: 2 },
      { id: "m1", rank: 3 },
    ];

    const out = applyStableCatalogOrder(prevOrder, nextSortedRows);
    expect(out.order).toEqual(["m1", "m2", "m3"]);
    expect(out.orderedRows.map((row) => row.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("inserts new IDs at their sorted slot while preserving existing order", () => {
    const prevOrder = ["m1", "m2", "m3"];
    const nextSortedRows: Row[] = [
      { id: "m2", rank: 1 },
      { id: "m4", rank: 2 },
      { id: "m1", rank: 3 },
      { id: "m3", rank: 4 },
    ];

    const out = applyStableCatalogOrder(prevOrder, nextSortedRows);
    expect(out.order).toEqual(["m1", "m2", "m4", "m3"]);
    expect(out.orderedRows.map((row) => row.id)).toEqual(["m1", "m2", "m4", "m3"]);
  });
});

