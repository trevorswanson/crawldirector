// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { useActionState, useFormStatus } = vi.hoisted(() => ({
  useActionState: vi.fn(),
  useFormStatus: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState,
}));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus,
}));
vi.mock("@/app/(dm)/actions", () => ({
  archiveEntityAction: vi.fn(),
  createCrawlerAction: Object.assign(vi.fn(), { bind: vi.fn(() => vi.fn()) }),
  createGenericEntityAction: Object.assign(vi.fn(), {
    bind: vi.fn(() => vi.fn()),
  }),
  updateEntityAction: Object.assign(vi.fn(), { bind: vi.fn(() => vi.fn()) }),
  quickCreateEntityAction: Object.assign(vi.fn(), {
    bind: vi.fn(() => vi.fn()),
  }),
}));

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
}));

import {
  ArchiveEntityForm,
  CreateCrawlerForm,
  CreateGenericEntityForm,
  EditEntityForm,
  EditFormProvider,
  QuickCreateStub,
  EditRailControls,
  VisibilitySidebarControl,
  useEditForm,
} from "@/components/entities/entity-forms";
import type { EntityDetail } from "@/server/services/entities";

const noopAction = vi.fn();

function CurrentVisibilityProbe() {
  const { visibility } = useEditForm();
  return (
    <input
      aria-label="current visibility"
      readOnly
      value={visibility ?? ""}
    />
  );
}

function VisibilityHarness({ editing }: { editing: boolean }) {
  return (
    <EditFormProvider initialVisibility="PLAYER_FACING" isEditing={editing}>
      <VisibilitySidebarControl
        initialVisibility="PLAYER_FACING"
        isEditing={editing}
        isLocked={false}
      />
      <CurrentVisibilityProbe />
    </EditFormProvider>
  );
}

const crawlerEntity: EntityDetail = {
  id: "e1",
  campaignId: "c1",
  type: "CRAWLER",
  name: "Carl",
  summary: "No shoes",
  description: "Crawler notes",
  status: "CANON",
  visibility: "PLAYER_FACING",
  source: "DM",
  tags: ["floor 1"],
  version: 1,
  locked: false,
  lockedFields: [],
  isStub: false,
  data: null,
  agentEnabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  crawler: {
    realName: "Carl",
    crawlerNo: "1",
    level: 2,
    hp: 30,
    mp: 5,
    gold: 10,
    viewCount: BigInt(5000),
    followerCount: BigInt(500),
    favoriteCount: BigInt(50),
    killCount: 3,
    isAlive: true,
    currentFloor: 1,
  },
};

const genericEntity: EntityDetail = {
  ...crawlerEntity,
  id: "e2",
  type: "NPC",
  name: "Zev",
  summary: null,
  description: null,
  visibility: "DM_ONLY",
  tags: [],
  crawler: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  useActionState.mockReturnValue([undefined, noopAction]);
  useFormStatus.mockReturnValue({ pending: false });
});

afterEach(cleanup);

describe("entity forms", () => {
  it("renders the crawler creation fields", () => {
    render(<CreateCrawlerForm campaignId="c1" />);

    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(screen.getByLabelText("Real name")).toBeDefined();
    expect(screen.getByLabelText("Crawler number")).toBeDefined();
    expect(screen.getByLabelText("Views")).toBeDefined();
    expect(screen.getByLabelText("Followers")).toBeDefined();
    expect(screen.getByLabelText("Favorites")).toBeDefined();
    expect(screen.getByRole("button", { name: /Create crawler/ })).toBeDefined();
  });

  it("renders the generic entity creation type selector", () => {
    render(<CreateGenericEntityForm campaignId="c1" />);

    expect(screen.getByLabelText("Type")).toBeDefined();
    expect(screen.getByRole("button", { name: /Create entity/ })).toBeDefined();
  });

  it("renders crawler edit values and success state", () => {
    useActionState.mockReturnValue([{ success: "Saved." }, noopAction]);
    render(
      <EditFormProvider>
        <EditEntityForm campaignId="c1" entity={crawlerEntity} />
      </EditFormProvider>,
    );

    expect(screen.getAllByDisplayValue("Carl")).toHaveLength(2);
    expect(screen.getByDisplayValue("Crawler notes")).toBeDefined();
    expect(screen.getByDisplayValue("500")).toBeDefined();
    expect(screen.getByText("Saved.")).toBeDefined();
  });

  it("marks fields as read-only/disabled when locked", () => {
    useActionState.mockReturnValue([undefined, noopAction]);
    const lockedEntity: EntityDetail = {
      ...crawlerEntity,
      locked: false,
      lockedFields: ["crawler.realName", "visibility"],
    };
    render(
      <EditFormProvider>
        <EditEntityForm campaignId="c1" entity={lockedEntity} />
      </EditFormProvider>,
    );

    // realName is locked
    const realNameInput = screen.getByLabelText("Real name");
    expect(realNameInput.getAttribute("readonly")).not.toBeNull();

    // visibility is no longer an in-form select; it is carried as a hidden
    // input and edited via the sidebar control. The hidden input preserves the
    // entity's current visibility value.
    const visibilityInput = document.querySelector(
      'input[name="visibility"]',
    ) as HTMLInputElement | null;
    expect(visibilityInput).not.toBeNull();
    expect(visibilityInput?.getAttribute("type")).toBe("hidden");
    expect(visibilityInput?.getAttribute("value")).toBe("PLAYER_FACING");

    // name is not locked
    const nameInput = screen.getByLabelText("Name");
    expect(nameInput.getAttribute("readonly")).toBeNull();
  });

  it("renders generic edit fields without crawler-only inputs", () => {
    useActionState.mockReturnValue([{ error: "Nope" }, noopAction]);
    render(
      <EditFormProvider>
        <EditEntityForm campaignId="c1" entity={genericEntity} />
      </EditFormProvider>,
    );

    expect(screen.getByDisplayValue("Zev")).toBeDefined();
    expect(screen.queryByLabelText("Crawler number")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Nope");
  });

  it("renders archive action and pending submit state", () => {
    useFormStatus.mockReturnValue({ pending: true });
    render(<ArchiveEntityForm campaignId="c1" entityId="e1" />);

    expect(screen.getByRole("button", { name: /Archive/ })).toBeDefined();
  });

  it("toggles the quick-create stub form open", () => {
    render(<QuickCreateStub campaignId="c1" />);

    expect(
      screen.getByRole("button", { name: /Quick-create stub/ }),
    ).toBeDefined();
    expect(screen.queryByPlaceholderText(/New entity name/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Quick-create stub/ }));

    expect(screen.getByPlaceholderText(/New entity name/)).toBeDefined();
    expect(screen.getByRole("button", { name: /Create stub/ })).toBeDefined();
  });

  it("redirects to read-only view if the entity is locked and no error state is present", () => {
    const lockedEntity: EntityDetail = {
      ...crawlerEntity,
      locked: true,
    };
    render(
      <EditFormProvider>
        <EditEntityForm campaignId="c1" entity={lockedEntity} />
      </EditFormProvider>,
    );
    expect(mockReplace).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
  });

  it("does not redirect to read-only view if the entity is locked but an error state is present", () => {
    mockReplace.mockClear();
    useActionState.mockReturnValue([{ error: "Touches locked fields" }, noopAction]);
    const lockedEntity: EntityDetail = {
      ...crawlerEntity,
      locked: true,
    };
    render(
      <EditFormProvider>
        <EditEntityForm campaignId="c1" entity={lockedEntity} />
      </EditFormProvider>,
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("preserves and displays submitted form values when save fails with error state", () => {
    const errorState = {
      error: "Locked",
      timestamp: 12345,
      values: {
        name: "Carl Changed Name",
        summary: "New summary content",
        description: "New description text",
        tags: "tag1, tag2",
        realName: "Carl Real Name",
        crawlerNo: "999",
        level: 10,
        hp: 150,
        mp: 40,
        gold: 300,
        viewCount: "500000",
        followerCount: "25000",
        favoriteCount: "1200",
        killCount: 99,
        currentFloor: 5,
        isAlive: false,
      },
    };
    useActionState.mockReturnValue([errorState, noopAction]);
    render(
      <EditFormProvider>
        <EditEntityForm campaignId="c1" entity={crawlerEntity} />
      </EditFormProvider>,
    );

    expect(screen.getByDisplayValue("Carl Changed Name")).toBeDefined();
    expect(screen.getByDisplayValue("New summary content")).toBeDefined();
    expect(screen.getByDisplayValue("New description text")).toBeDefined();
    expect(screen.getByDisplayValue("tag1, tag2")).toBeDefined();
    expect(screen.getByDisplayValue("Carl Real Name")).toBeDefined();
    expect(screen.getByDisplayValue("999")).toBeDefined();
    expect(screen.getByDisplayValue("10")).toBeDefined();
    expect(screen.getByDisplayValue("150")).toBeDefined();
    expect(screen.getByDisplayValue("40")).toBeDefined();
    expect(screen.getByDisplayValue("300")).toBeDefined();
    expect(screen.getByDisplayValue("500000")).toBeDefined();
    expect(screen.getByDisplayValue("25000")).toBeDefined();
    expect(screen.getByDisplayValue("1200")).toBeDefined();
    expect(screen.getByDisplayValue("99")).toBeDefined();
    expect(screen.getByDisplayValue("5")).toBeDefined();
    expect(screen.getByDisplayValue("Dead")).toBeDefined();
  });

  const itemEntity: EntityDetail = {
    id: "e3",
    campaignId: "c1",
    type: "ITEM",
    name: "Gourd of Doom",
    summary: "A heavy gourd",
    description: "It is scary",
    status: "CANON",
    visibility: "PLAYER_FACING",
    source: "DM",
    tags: ["floor 2"],
    version: 1,
    locked: false,
    lockedFields: [],
    isStub: false,
    agentEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    crawler: null,
    data: {
      itemTypeId: "it1",
      divine: true,
      unique: false,
      fleeting: true,
      aiDescription: "Official flavor text",
    },
  };

  it("renders ITEM fields and attributes properly", () => {
    const itemTypes = [
      { id: "it1", name: "Gourd Type" },
      { id: "it2", name: "Sword Type" },
    ];
    render(
      <EditFormProvider>
        <EditEntityForm campaignId="c1" entity={itemEntity} itemTypes={itemTypes} />
      </EditFormProvider>,
    );

    expect(screen.getByLabelText("AI Description")).toBeDefined();
    expect(screen.getByDisplayValue("Official flavor text")).toBeDefined();
    expect(screen.getByLabelText("Item Type")).toBeDefined();
    expect(screen.getByDisplayValue("Gourd Type")).toBeDefined();

    const divineCheckbox = screen.getByLabelText("Divine") as HTMLInputElement;
    expect(divineCheckbox.checked).toBe(true);

    const uniqueCheckbox = screen.getByLabelText("Unique") as HTMLInputElement;
    expect(uniqueCheckbox.checked).toBe(false);

    const fleetingCheckbox = screen.getByLabelText("Fleeting") as HTMLInputElement;
    expect(fleetingCheckbox.checked).toBe(true);
  });

  it("disables ITEM fields when locked or fields are locked", () => {
    const itemTypes = [{ id: "it1", name: "Gourd Type" }];
    const lockedItem: EntityDetail = {
      ...itemEntity,
      lockedFields: [
        "data.itemTypeId",
        "data.divine",
        "data.unique",
        "data.fleeting",
        "data.aiDescription",
      ],
    };
    render(
      <EditFormProvider>
        <EditEntityForm campaignId="c1" entity={lockedItem} itemTypes={itemTypes} />
      </EditFormProvider>,
    );

    expect(screen.getByLabelText("Item Type").getAttribute("disabled")).not.toBeNull();
    expect(screen.getByLabelText("Divine").getAttribute("disabled")).not.toBeNull();
    expect(screen.getByLabelText("Unique").getAttribute("disabled")).not.toBeNull();
    expect(screen.getByLabelText("Fleeting").getAttribute("disabled")).not.toBeNull();
    expect(screen.getByLabelText("AI Description").getAttribute("readonly")).not.toBeNull();
  });

  it("renders EditRailControls properly inside provider", () => {
    render(
      <EditFormProvider>
        <EditRailControls detailHref="/campaigns/c1/entities/e1" />
      </EditFormProvider>,
    );

    expect(screen.getByRole("button", { name: /Save/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /Discard/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /Discard/ }).getAttribute("href")).toBe(
      "/campaigns/c1/entities/e1",
    );
  });

  it("resets unsaved sidebar visibility when edit mode is discarded", () => {
    const { rerender } = render(<VisibilityHarness editing />);

    fireEvent.click(screen.getByRole("button", { name: /dm only/i }));
    expect(
      (screen.getByLabelText("current visibility") as HTMLInputElement).value,
    ).toBe("DM_ONLY");

    rerender(<VisibilityHarness editing={false} />);

    expect(
      (screen.getByLabelText("current visibility") as HTMLInputElement).value,
    ).toBe(
      "PLAYER_FACING",
    );
  });
});
