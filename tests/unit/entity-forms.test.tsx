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
} from "@/components/entities/entity-forms";
import type { EntityDetail } from "@/server/services/entities";

const noopAction = vi.fn();

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

    // visibility is locked
    const visibilitySelect = screen.getByLabelText("Visibility");
    expect(visibilitySelect.getAttribute("disabled")).not.toBeNull();

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
});
