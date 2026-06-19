// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { kindFormFields } from "@/components/entities/kind-fields";
import type { EntityDetail } from "@/server/services/entities";

afterEach(cleanup);

function floorEntity(data: Record<string, unknown>): EntityDetail {
  return { type: "FLOOR", data } as unknown as EntityDetail;
}

const getVal = (_key: string, dbVal: unknown) => dbVal;

describe("entity-kind form fields (ADR 0009)", () => {
  it("returns the FLOOR fields component and renders its inputs", () => {
    const FloorFields = kindFormFields("FLOOR");
    expect(FloorFields).toBeTypeOf("function");
    if (!FloorFields) throw new Error("expected FLOOR fields component");

    const entity = floorEntity({
      floorNumber: 9,
      theme: "Castle siege",
      startDay: 0,
      collapseDay: 12,
    });
    render(<FloorFields entity={entity} getVal={getVal} isLocked={() => false} />);

    expect((screen.getByLabelText("Floor number") as HTMLInputElement).value).toBe("9");
    expect((screen.getByLabelText("Theme") as HTMLInputElement).value).toBe("Castle siege");
    expect((screen.getByLabelText("Opens on day") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("Collapses on day") as HTMLInputElement).value).toBe("12");
    // No locked-field hidden mirrors when nothing is locked.
    expect(document.querySelectorAll('input[type="hidden"]').length).toBe(0);
  });

  it("renders read-only inputs + hidden mirrors when fields are locked", () => {
    const FloorFields = kindFormFields("FLOOR")!;
    const entity = floorEntity({ floorNumber: 3, theme: "Bone market" });
    render(<FloorFields entity={entity} getVal={getVal} isLocked={() => true} />);

    expect((screen.getByLabelText("Floor number") as HTMLInputElement).readOnly).toBe(true);
    // One hidden mirror per locked data.* field (floorNumber/theme/startDay/collapseDay).
    expect(document.querySelectorAll('input[type="hidden"]').length).toBe(4);
  });

  it("prefills FLOOR inputs from the satellite, not the data blob (ADR 0011 Part C)", () => {
    const FloorFields = kindFormFields("FLOOR")!;
    // A migrated FLOOR: blob is just the version stamp, values live in `floor`.
    const entity = {
      type: "FLOOR",
      data: { _v: 3 },
      floor: { floorNumber: 9, theme: "Castle siege", startDay: 0, collapseDay: 12 },
    } as unknown as EntityDetail;
    render(<FloorFields entity={entity} getVal={getVal} isLocked={() => false} />);

    expect((screen.getByLabelText("Floor number") as HTMLInputElement).value).toBe("9");
    expect((screen.getByLabelText("Theme") as HTMLInputElement).value).toBe("Castle siege");
    expect((screen.getByLabelText("Collapses on day") as HTMLInputElement).value).toBe("12");
  });

  it("tolerates a FLOOR entity with no data", () => {
    const FloorFields = kindFormFields("FLOOR")!;
    render(
      <FloorFields
        entity={{ type: "FLOOR", data: null } as unknown as EntityDetail}
        getVal={getVal}
        isLocked={() => false}
      />,
    );
    expect((screen.getByLabelText("Floor number") as HTMLInputElement).value).toBe("");
  });

  it("returns undefined for a type with no bespoke fields", () => {
    expect(kindFormFields("NPC")).toBeUndefined();
    expect(kindFormFields("CRAWLER")).toBeUndefined();
  });

  function itemEntity(
    data: Record<string, unknown>,
    lockedFields: string[] = [],
  ): EntityDetail {
    return { type: "ITEM", data, locked: false, lockedFields } as unknown as EntityDetail;
  }

  const itemTypes = [
    { id: "it1", name: "Gourd Type" },
    { id: "it2", name: "Sword Type" },
  ];

  it("returns the ITEM fields component and renders its inputs", () => {
    const ItemFields = kindFormFields("ITEM");
    expect(ItemFields).toBeTypeOf("function");
    if (!ItemFields) throw new Error("expected ITEM fields component");

    const entity = itemEntity({
      itemTypeId: "it1",
      divine: true,
      unique: false,
      fleeting: true,
      aiDescription: "Official flavor text",
    });
    render(
      <ItemFields
        entity={entity}
        getVal={getVal}
        isLocked={() => false}
        itemTypes={itemTypes}
      />,
    );

    expect((screen.getByLabelText("AI Description") as HTMLTextAreaElement).value).toBe(
      "Official flavor text",
    );
    expect((screen.getByLabelText("Item Type") as HTMLSelectElement).value).toBe("it1");
    expect((screen.getByLabelText("Divine") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Unique") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Fleeting") as HTMLInputElement).checked).toBe(true);
    expect(document.querySelectorAll('input[type="hidden"]').length).toBe(0);
  });

  it("renders disabled ITEM inputs + hidden mirrors when fields are locked", () => {
    const ItemFields = kindFormFields("ITEM")!;
    const entity = itemEntity(
      { itemTypeId: "it1", divine: true, aiDescription: "x" },
      ["data.itemTypeId", "data.divine", "data.unique", "data.fleeting", "data.aiDescription"],
    );
    render(
      <ItemFields
        entity={entity}
        getVal={getVal}
        isLocked={() => true}
        itemTypes={itemTypes}
      />,
    );

    expect((screen.getByLabelText("AI Description") as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.getByLabelText("Item Type").getAttribute("disabled")).not.toBeNull();
    expect(screen.getByLabelText("Divine").getAttribute("disabled")).not.toBeNull();
    // One hidden mirror per locked data.* field (itemTypeId/divine/unique/fleeting).
    expect(document.querySelectorAll('input[type="hidden"]').length).toBe(4);
  });

  it("tolerates an ITEM entity with no data and no itemTypes", () => {
    const ItemFields = kindFormFields("ITEM")!;
    render(
      <ItemFields
        entity={{ type: "ITEM", data: null, locked: false, lockedFields: [] } as unknown as EntityDetail}
        getVal={getVal}
        isLocked={() => false}
      />,
    );
    expect((screen.getByLabelText("Item Type") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Divine") as HTMLInputElement).checked).toBe(false);
  });
});
