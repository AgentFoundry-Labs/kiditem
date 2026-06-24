import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionCanvasGraph } from "../lib/execution-canvas-graph";
import { ExecutionCanvas } from "./ExecutionCanvas";

const canvasGraph: ExecutionCanvasGraph = {
  conversationId: "conversation-1",
  rootRequestId: "request-operator-1",
  summary: {
    totalNodes: 5,
    runningNodes: 1,
    failedNodes: 0,
    approvalNodes: 1,
  },
  nodes: [
    {
      id: "task:request-operator-1",
      sourceId: "request-operator-1",
      laneId: "operator",
      kind: "agent",
      label: "Operator",
      eyebrow: "Operator",
      description: null,
      status: "succeeded",
      startedAt: "2026-06-04T00:00:00.000Z",
      finishedAt: "2026-06-04T00:00:03.000Z",
      metadata: {},
    },
    {
      id: "tool:tool-scrape-1",
      sourceId: "tool-scrape-1",
      laneId: "sourcing",
      kind: "tool",
      label: "Scrape Url",
      eyebrow: "sourcing_scrape_url",
      description: null,
      status: "succeeded",
      startedAt: "2026-06-04T00:00:05.000Z",
      finishedAt: "2026-06-04T00:00:09.000Z",
      metadata: {},
    },
    {
      id: "artifact:artifact-candidate-1",
      sourceId: "artifact-candidate-1",
      laneId: "sourcing",
      kind: "artifact",
      label: "1688 오프로드 장난감 후보",
      eyebrow: "sourcing_candidate",
      description: null,
      status: "succeeded",
      startedAt: "2026-06-04T00:00:10.000Z",
      finishedAt: "2026-06-04T00:00:10.000Z",
      metadata: {},
    },
    {
      id: "tool:tool-listing-1",
      sourceId: "tool-listing-1",
      laneId: "listing",
      kind: "tool",
      label: "Create Generation Package",
      eyebrow: "listing_create_generation_package",
      description: null,
      status: "running",
      startedAt: "2026-06-04T00:00:14.000Z",
      finishedAt: null,
      metadata: {},
    },
    {
      id: "approval:approval-1",
      sourceId: "approval-1",
      laneId: "listing",
      kind: "approval",
      label: "User approval required",
      eyebrow: "channels_submit_coupang_listing",
      description: null,
      status: "waiting_approval",
      startedAt: "2026-06-04T00:00:18.000Z",
      finishedAt: null,
      metadata: { approvalRequestId: "approval-1" },
    },
  ],
  lanes: [
    {
      id: "operator",
      label: "Operator",
      agentType: "operator",
      nodes: [],
    },
    {
      id: "sourcing",
      label: "Sourcing Agent",
      agentType: "sourcing",
      nodes: [],
    },
    {
      id: "listing",
      label: "Listing Agent",
      agentType: "listing",
      nodes: [],
    },
  ],
  edges: [
    {
      id: "tool:tool-scrape-1->artifact:artifact-candidate-1",
      from: "tool:tool-scrape-1",
      to: "artifact:artifact-candidate-1",
      crossLane: false,
    },
    {
      id: "artifact:artifact-candidate-1->tool:tool-listing-1",
      from: "artifact:artifact-candidate-1",
      to: "tool:tool-listing-1",
      crossLane: true,
    },
  ],
};

canvasGraph.lanes = canvasGraph.lanes.map((lane) => ({
  ...lane,
  nodes: canvasGraph.nodes.filter((node) => node.laneId === lane.id),
}));

describe("ExecutionCanvas", () => {
  it("renders the execution canvas as the primary graph surface", () => {
    render(
      <ExecutionCanvas
        graph={canvasGraph}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByText("Execution Canvas")).toBeInTheDocument();
    expect(screen.getByText("Operator")).toBeInTheDocument();
    expect(screen.getByText("Sourcing Agent")).toBeInTheDocument();
    expect(screen.getByText("Listing Agent")).toBeInTheDocument();
    expect(screen.getByText("Scrape Url")).toBeInTheDocument();
    expect(screen.getByText("1688 오프로드 장난감 후보")).toBeInTheDocument();
    expect(screen.getByText("User approval required")).toBeInTheDocument();
  });

  it("selects a node when the user clicks a read-only node card", () => {
    const onSelectNode = vi.fn();
    render(
      <ExecutionCanvas
        graph={canvasGraph}
        selectedNodeId={null}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Scrape Url node in sourcing lane, succeeded",
      }),
    );

    expect(onSelectNode).toHaveBeenCalledWith("tool:tool-scrape-1");
  });

  it("exposes the selected node state to assistive technology", () => {
    render(
      <ExecutionCanvas
        graph={canvasGraph}
        selectedNodeId="tool:tool-scrape-1"
        onSelectNode={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Scrape Url node in sourcing lane, succeeded",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("marks live nodes, approval nodes, and active edges for execution animation", () => {
    const { container } = render(
      <ExecutionCanvas
        graph={canvasGraph}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Create Generation Package node in listing lane, running",
      }),
    ).toHaveAttribute("data-execution-node-state", "live");
    expect(
      screen.getByRole("button", {
        name: "User approval required node in listing lane, waiting_approval",
      }),
    ).toHaveAttribute("data-execution-node-state", "approval");
    expect(
      container.querySelector('[data-execution-edge-state="live"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-execution-lane-state="live"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("renders without edges when the graph has no edges", () => {
    const graphWithoutEdges: ExecutionCanvasGraph = {
      ...canvasGraph,
      edges: [],
    };

    expect(() =>
      render(
        <ExecutionCanvas
          graph={graphWithoutEdges}
          selectedNodeId={null}
          onSelectNode={vi.fn()}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByText("Execution Canvas")).toBeInTheDocument();
  });

  it("ignores an edge with a missing endpoint", () => {
    const graphWithMissingEndpoint: ExecutionCanvasGraph = {
      ...canvasGraph,
      edges: [
        {
          id: "tool:tool-scrape-1->missing-node",
          from: "tool:tool-scrape-1",
          to: "missing-node",
          crossLane: false,
        },
      ],
    };

    expect(() =>
      render(
        <ExecutionCanvas
          graph={graphWithMissingEndpoint}
          selectedNodeId={null}
          onSelectNode={vi.fn()}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByText("Scrape Url")).toBeInTheDocument();
  });

  it("fits the canvas to the available viewport", () => {
    const clientWidth = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(663);
    const clientHeight = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(270);

    try {
      render(
        <ExecutionCanvas
          graph={canvasGraph}
          selectedNodeId={null}
          onSelectNode={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Fit view" }));

      expect(screen.getByText("75%")).toBeInTheDocument();
    } finally {
      clientWidth.mockRestore();
      clientHeight.mockRestore();
    }
  });

  it("allows fit view to zoom below the manual lower bound", () => {
    const clientWidth = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(354);
    const clientHeight = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(144);

    try {
      render(
        <ExecutionCanvas
          graph={canvasGraph}
          selectedNodeId={null}
          onSelectNode={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Fit view" }));

      expect(screen.getByText("40%")).toBeInTheDocument();
    } finally {
      clientWidth.mockRestore();
      clientHeight.mockRestore();
    }
  });

  it("shows an empty state for a conversation without graph records", () => {
    render(
      <ExecutionCanvas
        graph={{
          conversationId: null,
          rootRequestId: null,
          lanes: [],
          nodes: [],
          edges: [],
          summary: {
            totalNodes: 0,
            runningNodes: 0,
            failedNodes: 0,
            approvalNodes: 0,
          },
        }}
        selectedNodeId={null}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByText("아직 실행 그래프가 없습니다")).toBeInTheDocument();
  });

  it("does not expose builder controls in V1", () => {
    render(
      <ExecutionCanvas
        graph={canvasGraph}
        selectedNodeId="tool:tool-scrape-1"
        onSelectNode={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "노드 추가" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "연결 추가" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "워크플로우 저장" }),
    ).not.toBeInTheDocument();
  });
});
