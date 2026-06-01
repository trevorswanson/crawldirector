// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { createCampaignEventAction } = vi.hoisted(() => ({
  createCampaignEventAction: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({ createCampaignEventAction }));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { CampaignTimeline } from "@/components/timeline/campaign-timeline";
import type { CampaignTimelineEvent } from "@/server/services/events";

const candidates = [
  { id: "e1", name: "Carl", type: "CRAWLER" },
  { id: "e2", name: "Donut", type: "CRAWLER" },
];

const events: CampaignTimelineEvent[] = [
  {
    id: "ev1",
    title: "Boss fight",
    summary: "Carl and Donut survive.",
    time: { floor: 9, label: "Day 3" },
    orderKey: 9,
    secret: false,
    locked: false,
    source: "DM",
    participants: [
      { id: "e1", name: "Carl", type: "CRAWLER", role: "ACTOR" },
      { id: "e2", name: "Donut", type: "CRAWLER", role: "TARGET" },
    ],
    causedBy: [],
    causes: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("CampaignTimeline", () => {
  it("renders events with all visible participants", () => {
    render(
      <CampaignTimeline campaignId="c1" events={[...events]} candidates={candidates} />,
    );

    expect(screen.getByText("Boss fight")).toBeDefined();
    expect(screen.getByText("Carl")).toBeDefined();
    expect(screen.getByText("Donut")).toBeDefined();
    expect(screen.getByText("2 participants")).toBeDefined();
  });

  it("renders event state, unplaced time, and causality summaries", () => {
    render(
      <CampaignTimeline
        campaignId="c1"
        candidates={candidates}
        events={[
          {
            id: "ev-secret",
            title: "Secret locked scene",
            summary: null,
            time: { floor: null, label: null },
            orderKey: 0,
            secret: true,
            locked: true,
            source: "AI",
            participants: [],
            causedBy: [{ id: "cause", title: "Earlier scene", linkId: "link1" }],
            causes: [{ id: "effect", title: "Later scene", linkId: "link2" }],
          },
        ]}
      />,
    );

    expect(screen.getByText("Unplaced")).toBeDefined();
    expect(screen.getByText("secret")).toBeDefined();
    expect(screen.getByText("Locked")).toBeDefined();
    expect(screen.getByText("0 participants")).toBeDefined();
    expect(screen.getByText("Caused by Earlier scene")).toBeDefined();
    expect(screen.getByText("Causes Later scene")).toBeDefined();
  });

  it("submits a multi-participant event", async () => {
    createCampaignEventAction.mockResolvedValue(undefined);
    render(<CampaignTimeline campaignId="c1" events={[]} candidates={candidates} />);

    fireEvent.click(screen.getByRole("button", { name: "Log event" }));
    fireEvent.change(screen.getByPlaceholderText("What happened?"), {
      target: { value: "Arena cascade" },
    });
    fireEvent.change(screen.getByPlaceholderText("Search participant..."), {
      target: { value: "Carl" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Carl/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add participant" }));
    fireEvent.change(screen.getByPlaceholderText("Search participant..."), {
      target: { value: "Donut" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Donut/ }));
    fireEvent.change(screen.getAllByLabelText("Participant role")[1], {
      target: { value: "TARGET" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Log event/ }));

    await waitFor(() => expect(createCampaignEventAction).toHaveBeenCalledTimes(1));
    const [, , submitted] = createCampaignEventAction.mock.calls[0];
    expect(submitted.get("participantCount")).toBe("2");
    expect(submitted.get("participantId_0")).toBe("e1");
    expect(submitted.get("participantRole_0")).toBe("ACTOR");
    expect(submitted.get("participantId_1")).toBe("e2");
    expect(submitted.get("participantRole_1")).toBe("TARGET");
  });

  it("surfaces action errors and lets the DM cancel", async () => {
    createCampaignEventAction.mockResolvedValue({ error: "Choose at least one participant." });
    render(<CampaignTimeline campaignId="c1" events={[]} candidates={candidates} />);

    fireEvent.click(screen.getByRole("button", { name: "Log event" }));
    fireEvent.change(screen.getByPlaceholderText("What happened?"), {
      target: { value: "No witness" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Log event/ }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Choose at least one participant.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByPlaceholderText("What happened?")).toBeNull();
  });

  it("removes added participant rows", () => {
    render(<CampaignTimeline campaignId="c1" events={[]} candidates={candidates} />);

    fireEvent.click(screen.getByRole("button", { name: "Log event" }));
    fireEvent.click(screen.getByRole("button", { name: "Add participant" }));
    expect(screen.getAllByLabelText("Participant role")).toHaveLength(2);

    fireEvent.click(screen.getAllByTitle("Remove participant row")[1]);

    expect(screen.getAllByLabelText("Participant role")).toHaveLength(1);
  });
});
