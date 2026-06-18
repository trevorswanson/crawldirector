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
