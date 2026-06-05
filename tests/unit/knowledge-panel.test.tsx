// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const {
  grantEntityKnownToAction,
  grantEntityKnowsAboutAction,
  revokeKnowledgeAction,
} = vi.hoisted(() => ({
  grantEntityKnownToAction: vi.fn(),
  grantEntityKnowsAboutAction: vi.fn(),
  revokeKnowledgeAction: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({
  grantEntityKnownToAction,
  grantEntityKnowsAboutAction,
  revokeKnowledgeAction,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { KnowledgePanel } from "@/components/entities/knowledge-panel";
import type { EntityCandidate } from "@/components/entities/entity-typeahead";
import type { KnowledgeGrantView } from "@/server/services/knowledge";

const candidates: EntityCandidate[] = [
  { id: "e2", name: "Donut", type: "CRAWLER" },
  { id: "e3", name: "Mordecai", type: "NPC" },
];

function grant(over: Partial<KnowledgeGrantView> = {}): KnowledgeGrantView {
  return {
    id: "k1",
    entity: { id: "e3", name: "Mordecai", type: "NPC" },
    notes: null,
    revealedAt: new Date(),
    ...over,
  };
}

function renderPanel(props: Partial<React.ComponentProps<typeof KnowledgePanel>> = {}) {
  return render(
    <KnowledgePanel
      campaignId="c1"
      entityId="e1"
      entityName="The Hidden Vault"
      knownTo={[]}
      knowsAbout={[]}
      candidates={candidates}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("KnowledgePanel", () => {
  it("renders both sections with empty states and the fog-of-war intro", () => {
    renderPanel();
    expect(screen.getByText("Known to · 0")).toBeDefined();
    expect(screen.getByText("Knows about · 0")).toBeDefined();
    expect(screen.getByText("No one has been told about this yet.")).toBeDefined();
    expect(
      screen.getByText(/Private reveals — who knows The Hidden Vault/),
    ).toBeDefined();
  });

  it("lists a 'known to' grant with notes and a link to the recipient", () => {
    renderPanel({
      knownTo: [grant({ notes: "Overheard the guards." })],
    });
    expect(screen.getByText("Known to · 1")).toBeDefined();
    expect(screen.getByText("Mordecai")).toBeDefined();
    expect(screen.getByText("Overheard the guards.")).toBeDefined();
    expect(screen.getByText("Mordecai").closest("a")?.getAttribute("href")).toBe(
      "/campaigns/c1/entities/e3",
    );
    expect(screen.getByRole("button", { name: "Revoke reveal" })).toBeDefined();
  });

  it("reveals the viewed entity to a picked recipient via grantEntityKnownToAction", async () => {
    grantEntityKnownToAction.mockResolvedValue(undefined);
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Reveal to…/ }));
    fireEvent.change(screen.getByPlaceholderText("Reveal to entity…"), {
      target: { value: "Donut" },
    });
    fireEvent.click(screen.getByText("Donut"));
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));

    await waitFor(() => expect(grantEntityKnownToAction).toHaveBeenCalledTimes(1));
    const [, , , formData] = grantEntityKnownToAction.mock.calls[0];
    expect((formData as FormData).get("entityId")).toBe("e2");
  });

  it("records 'knows about' via grantEntityKnowsAboutAction", async () => {
    grantEntityKnowsAboutAction.mockResolvedValue(undefined);
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Add knowledge…/ }));
    fireEvent.change(screen.getByPlaceholderText("Reveal canon to this entity…"), {
      target: { value: "Donut" },
    });
    fireEvent.click(screen.getByText("Donut"));
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));

    await waitFor(() => expect(grantEntityKnowsAboutAction).toHaveBeenCalledTimes(1));
  });

  it("surfaces a ServiceError message from the grant action", async () => {
    grantEntityKnownToAction.mockResolvedValue({ error: "Already revealed." });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Reveal to…/ }));
    fireEvent.change(screen.getByPlaceholderText("Reveal to entity…"), {
      target: { value: "Donut" },
    });
    fireEvent.click(screen.getByText("Donut"));
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));

    expect(await screen.findByText("Already revealed.")).toBeDefined();
  });

  it("revokes a grant via revokeKnowledgeAction", async () => {
    revokeKnowledgeAction.mockResolvedValue(undefined);
    renderPanel({ knownTo: [grant()] });

    fireEvent.submit(
      screen.getByRole("button", { name: "Revoke reveal" }).closest("form")!,
    );

    // The form action is `revokeKnowledgeAction.bind(null, campaignId, entityId,
    // grantId)`, so React invokes it with those three bound args (plus formData).
    await waitFor(() => expect(revokeKnowledgeAction).toHaveBeenCalled());
    expect(revokeKnowledgeAction.mock.calls[0].slice(0, 3)).toEqual(["c1", "e1", "k1"]);
  });

  it("prompts to create another entity when there is nothing left to reveal", () => {
    renderPanel({
      candidates: [],
      knownTo: [],
      knowsAbout: [],
    });
    expect(screen.getAllByText("Create another entity to reveal.").length).toBe(2);
  });

  it("hides already-granted recipients from the picker", () => {
    renderPanel({ knownTo: [grant({ entity: { id: "e3", name: "Mordecai", type: "NPC" } })] });

    fireEvent.click(screen.getByRole("button", { name: /Reveal to…/ }));
    fireEvent.change(screen.getByPlaceholderText("Reveal to entity…"), {
      target: { value: "Mordecai" },
    });
    // Mordecai is already a recipient, so it is not offered again (only the list
    // row above remains).
    expect(screen.queryAllByText("Mordecai")).toHaveLength(1);
  });
});
