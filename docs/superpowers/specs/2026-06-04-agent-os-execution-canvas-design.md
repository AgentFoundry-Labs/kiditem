# Agent OS Execution Canvas Design

Date: 2026-06-04

## Summary

Agent OS should expose an execution-first canvas for agent work. The screen is
not a workflow builder. It is a read-only execution workspace that visualizes
what Hermes, the Operator, and leaf agents actually did while the user continues
to interact through chat.

The selected V1 direction is **Agent Lanes**:

- The canvas is the primary surface.
- The right panel is the chat, instruction, approval, and node-detail surface.
- The left rail is navigation/status tooling.
- Each agent receives a swimlane.
- Tool calls, artifacts, approvals, and finalization steps appear inside or
  adjacent to the owning agent lane.

This gives KidItem the n8n-like canvas feel the user wants without implying that
users directly edit workflow graphs.

## Goals

- Show the current Agent OS run as a live visual execution flow.
- Make Operator-to-agent delegation visible.
- Make leaf-agent tool usage visible without exposing hidden reasoning.
- Make generated artifacts easy to find from the run graph.
- Keep the user in the same Agent OS workspace while they chat, inspect, and
  approve work.
- Preserve KidItem as the source of truth for task state, permissions,
  approvals, artifacts, audit, and side effects.

## Non-Goals

- No user-authored workflow builder in V1.
- No direct node creation, deletion, or edge editing.
- No saved workflow templates generated from the canvas.
- No hidden chain-of-thought or raw model reasoning display.
- No external marketplace registration or supplier ordering unless an explicit
  approval node is reached and approved.

## Primary Layout

The Agent OS page uses three persistent regions:

1. **Left rail**
   - compact workspace navigation
   - current run status indicator
   - optional filters such as running, failed, approval-needed

2. **Execution canvas**
   - large dotted-grid canvas
   - horizontally flowing node graph
   - agent swimlanes stacked vertically
   - zoom, fit-to-view, and reset controls
   - no editing controls in V1

3. **Right panel**
   - active chat thread
   - user instructions and Agent responses
   - approval prompts
   - selected node detail drawer content

The canvas is the visual primary surface. Chat remains available at all times,
but it does not dominate the screen.

## Canvas Model

V1 uses an Agent Lane graph.

Example for the first live scenario:

```text
Operator Lane
  User request
    -> Create Sourcing Agent task
    -> Create Listing Agent task
    -> Final summary

Sourcing Agent Lane
  sourcing_scrape_url
    -> product judgment
    -> sourcing candidate artifact

Listing Agent Lane
  listing_create_generation_package
    -> listing prep package artifact
    -> thumbnail draft artifact
    -> detail page draft artifact
```

Agent lanes communicate execution ownership. Edges communicate ordering and
handoff. A cross-lane edge means the Operator created or resumed another agent
task. A same-lane edge means a task/tool/artifact sequence happened inside that
agent's execution.

## Node Types

### Agent Node

Represents an execution subject:

- Operator
- Sourcing Agent
- Listing Agent
- Order Agent
- Channel Registration Agent

Fields shown on the card:

- agent label
- agent role
- status
- elapsed time when available
- child task count when useful

### Tool Node

Represents a KidItem-controlled capability/tool call:

- `sourcing_scrape_url`
- `sourcing_create_candidate`
- `listing_create_generation_package`
- `listing_create_thumbnail_draft`
- `listing_create_detail_draft`

Fields shown on the card:

- tool label
- short capability key
- status
- owner agent
- compact input/output summary when safe to show

### Artifact Node

Represents durable output created through KidItem:

- sourced product candidate
- scrape snapshot
- listing prep package
- thumbnail draft
- detail page draft

Fields shown on the card:

- artifact label
- artifact type
- status or freshness
- preview affordance when available

### Approval Node

Represents a paused action waiting for user permission:

- marketplace submit
- supplier order submit
- external account mutation
- high-impact write

Approval nodes are visually distinct and block downstream execution until the
right panel approval action is resolved.

## Status Language

The visual state vocabulary should be small and consistent:

- `waiting`: muted outline
- `running`: blue accent and subtle pulse
- `succeeded`: green check/status dot
- `failed`: red accent
- `waiting_approval`: amber accent
- `skipped`: muted dashed outline

The UI must never imply that a side effect happened when the backend returned
`waiting_approval`.

## Interaction Model

The graph is read-only in V1.

Allowed interactions:

- select a node
- pan canvas
- zoom canvas
- fit graph to viewport
- open artifact preview/detail
- approve or reject an approval request from the right panel
- send follow-up instructions in chat

Disallowed interactions:

- create nodes manually
- connect nodes manually
- delete nodes manually
- reorder execution manually
- drag nodes to mutate persisted graph structure

Node positions may be computed by the frontend layout layer. Persisted backend
state remains task/tool/artifact data, not user-authored diagram geometry.

## Data Flow

The frontend should adapt the existing `AgentRunGraph` contract rather than
inventing a separate canvas backend for V1.

Input data:

- task nodes from Agent OS task requests
- tool invocations from Agent OS tool invocation records
- artifacts from Agent OS artifact records
- approval requests from Agent OS approval records

Frontend graph projection:

- group task/tool/artifact nodes by owning agent
- create one lane per agent
- create ordering edges from timestamps, parent task relationships, and
  invocation/artifact ownership
- surface unknown relationships as unconnected but still visible nodes

Backend source of truth:

- task state
- tool invocation state
- artifact records
- approval state
- audit events

The frontend must not infer side-effect success from chat text. It should rely
on structured Agent OS records.

## First Scenario

The first scenario to validate visually is:

```text
1688 URL
  -> Operator task
  -> Sourcing Agent task
  -> 1688 scrape tool
  -> sourcing candidate artifact
  -> Listing Agent task
  -> listing generation package
  -> thumbnail draft artifact
  -> detail page draft artifact
  -> final user summary
```

No Coupang submission and no supplier order should happen in this scenario.
Those actions must appear only as potential future approval nodes.

## Error Handling

- If the graph is empty, show a canvas empty state tied to the current
  conversation rather than a separate dashboard.
- If a node fails, keep upstream successful nodes visible and mark the failed
  node clearly.
- If an artifact is missing, show the owning tool node with a missing-artifact
  warning instead of hiding the step.
- If a run is waiting for approval, keep the approval node selected by default
  and surface the decision controls in the right panel.
- If graph projection cannot determine an edge, show the node in the correct
  lane without a speculative edge.

## Testing

Implementation should include:

- graph projection unit tests for task/tool/artifact/approval nodes
- lane grouping tests by agent owner
- edge creation tests for parent task and invocation relationships
- status mapping tests
- React render tests for the execution canvas
- visual validation of `/agent-os` with a seeded or live Hermes execution run

The visual check should confirm:

- the canvas is the primary surface
- lanes are readable at desktop width
- right chat panel remains usable
- no text overlaps inside compact nodes
- failed and waiting-approval states are visually distinct

## Open Decisions For Later

- Whether completed artifacts can become reusable canvas cards in a later
  artifact-workspace mode.
- Whether users can pin or rearrange artifact cards after execution completes.
- Whether a future workflow-template builder should reuse this canvas component
  or live in a separate product surface.
- Whether traces from Hermes should be shown as nested detail rows under tool
  nodes or kept only in developer/debug views.
