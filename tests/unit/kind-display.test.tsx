// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// FieldLockToggle binds a server action; stub the action module so importing the
// panel doesn't pull next-auth/next-server into the jsdom run.
vi.mock("@/app/(dm)/actions", () => ({
  toggleEntityFieldLockAction: Object.assign(vi.fn(), { bind: vi.fn(() => vi.fn()) }),
}));

import { KindDisplay } from "@/components/entities/kind-display";
import type { EntityDetail } from "@/server/services/entities";

afterEach(cleanup);

function entity(
  type: string,
  data: Record<string, unknown> | null,
  overrides: Partial<EntityDetail> = {},
): EntityDetail {
  return {
    type,
    data,
    locked: false,
    lockedFields: [],
    ...overrides,
  } as unknown as EntityDetail;
}

const itemEntity = (
  data: Record<string, unknown> | null,
  overrides: Partial<EntityDetail> = {},
) => entity("ITEM", data, overrides);

describe("entity-kind display panel (ADR 0009)", () => {
  it("renders nothing for a type with no bespoke display", () => {
    const { container } = render(
      <KindDisplay campaignId="c1" entityId="e1" entity={entity("NPC", {})} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the ITEM field rows with the resolved item-type name", () => {
    render(
      <KindDisplay
        campaignId="c1"
        entityId="e1"
        entity={itemEntity({ itemTypeId: "it1", divine: true, unique: false, fleeting: true })}
        resolvedNames={{ "data.itemTypeId": "Gourd Type" }}
      />,
    );

    expect(screen.getByText("Gourd Type")).toBeDefined();
    expect(screen.getByText("Item Type")).toBeDefined();
    // Divine/Fleeting → Yes, Unique → No.
    expect(screen.getAllByText("Yes").length).toBe(2);
    expect(screen.getByText("No")).toBeDefined();
  });

  it("renders a broken-reference badge instead of the name for a broken ref", () => {
    render(
      <KindDisplay
        campaignId="c1"
        entityId="e1"
        entity={itemEntity({ itemTypeId: "missing" })}
        resolvedNames={{ "data.itemTypeId": null }}
        brokenReferences={["data.itemTypeId"]}
      />,
    );
    expect(screen.getByText("Broken reference")).toBeDefined();
  });

  it("does not show a broken badge when the reference resolves", () => {
    render(
      <KindDisplay
        campaignId="c1"
        entityId="e1"
        entity={itemEntity({ itemTypeId: "it1" })}
        resolvedNames={{ "data.itemTypeId": "Gourd Type" }}
        brokenReferences={[]}
      />,
    );
    expect(screen.getByText("Gourd Type")).toBeDefined();
    expect(screen.queryByText("Broken reference")).toBeNull();
  });

  it("composes the AI-description blockquote from the flags + flavor text", () => {
    render(
      <KindDisplay
        campaignId="c1"
        entityId="e1"
        entity={itemEntity({
          divine: true,
          unique: true,
          fleeting: true,
          aiDescription: "AI generated item details",
        })}
      />,
    );

    expect(screen.getByText(/This is a divine item\./)).toBeDefined();
    expect(screen.getByText(/This is a unique item\./)).toBeDefined();
    expect(screen.getByText(/This is a fleeting item\./)).toBeDefined();
    expect(screen.getByText(/AI generated item details/)).toBeDefined();
    const blockquote = screen
      .getByText(/AI generated item details/)
      .closest("blockquote");
    expect(blockquote).not.toBeNull();
    expect(blockquote?.className).not.toContain("italic");
  });

  it("omits the blockquote when there is neither a flag nor a description", () => {
    render(
      <KindDisplay
        campaignId="c1"
        entityId="e1"
        entity={itemEntity({ itemTypeId: null })}
      />,
    );
    expect(document.querySelector("blockquote")).toBeNull();
    // The field rows still render (Item Type falls back to —).
    expect(screen.getByText("Item Type")).toBeDefined();
  });

  it("shows the empty-description placeholder + lock button when aiDescription is locked", () => {
    render(
      <KindDisplay
        campaignId="c1"
        entityId="e1"
        entity={itemEntity(
          { aiDescription: null },
          { lockedFields: ["data.aiDescription"] },
        )}
      />,
    );
    expect(screen.getByText("Empty AI description (locked)")).toBeDefined();
    expect(screen.getByTitle("Locked field — click to unlock")).toBeDefined();
  });

  it("tolerates an ITEM entity with no data", () => {
    render(
      <KindDisplay
        campaignId="c1"
        entityId="e1"
        entity={itemEntity(null)}
      />,
    );
    expect(screen.getByText("Item Type")).toBeDefined();
  });

  it("renders FACTION rows from the satellite, not the data blob (ADR 0011 Part C)", () => {
    render(
      <KindDisplay
        campaignId="c1"
        entityId="e1"
        entity={entity(
          "FACTION",
          { _v: 1 },
          {
            faction: {
              standing: 42,
              strength: 7,
              allegiance: "The System",
              resources: "Three legions.",
            },
          } as unknown as Partial<EntityDetail>,
        )}
      />,
    );
    expect(screen.getByText("Standing")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("Strength")).toBeDefined();
    expect(screen.getByText("7")).toBeDefined();
    expect(screen.getByText("The System")).toBeDefined();
    expect(screen.getByText("Three legions.")).toBeDefined();
    // No satellite values masquerading in the additional-data fallback.
    expect(screen.queryByText("Additional data")).toBeNull();
  });

  it("renders FLOOR rows from the satellite, not the data blob (ADR 0011 Part C)", () => {
    render(
      <KindDisplay
        campaignId="c1"
        entityId="e1"
        entity={entity(
          "FLOOR",
          { _v: 3 },
          {
            floor: {
              floorNumber: 9,
              theme: "Castle siege",
              startDay: 0,
              collapseDay: 12,
            },
          } as unknown as Partial<EntityDetail>,
        )}
      />,
    );
    expect(screen.getByText("Floor number")).toBeDefined();
    expect(screen.getByText("9")).toBeDefined();
    expect(screen.getByText("Castle siege")).toBeDefined();
    expect(screen.getByText("Day 12")).toBeDefined();
    // No satellite values masquerading in the additional-data fallback.
    expect(screen.queryByText("Additional data")).toBeNull();
  });

  it("tolerates a FACTION with no satellite row (empty rows)", () => {
    render(
      <KindDisplay
        campaignId="c1"
        entityId="e1"
        entity={entity("FACTION", { _v: 1 })}
      />,
    );
    expect(screen.getByText("Standing")).toBeDefined();
    // Every value falls back to the em-dash placeholder.
    expect(screen.getAllByText("—").length).toBe(4);
  });

  it("hides the reserved _v stamp + handled keys from the additional-data panel", () => {
    render(
      <KindDisplay
        campaignId="c1"
        entityId="e1"
        entity={itemEntity({
          divine: true,
          _v: 1,
          legacyNote: "ad-hoc extra",
        })}
      />,
    );
    // The genuine off-schema key surfaces in the fallback panel...
    expect(screen.getByText("Additional data")).toBeDefined();
    expect(screen.getByText("ad-hoc extra")).toBeDefined();
    // ...but the version stamp never renders as a data row (no "Version"/"_v" label).
    expect(screen.queryByText("_v")).toBeNull();
    expect(screen.queryByText("Version")).toBeNull();
  });
});
