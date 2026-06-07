// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { kindFormFields } from "@/components/entities/kind-fields";
import type { EntityDetail } from "@/server/services/entities";

afterEach(cleanup);

function floorEntity(data: Record<string, unknown>): EntityDetail {
  return { type: "FLOOR", data } as unknown as EntityDetail;
}

const getVal = (_key: string, dbVal: string | number | undefined) => dbVal;

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
});
