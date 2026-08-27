# Agent OS Chat Workspace UX Design

**Date:** 2026-08-26
**Status:** Approved
**Revised:** 2026-08-28
**Scope:** KID-25 global AI chat panel, shared authenticated sidebar shell, Agent OS history workspace, KidItem visual alignment, Gateway-local conversation preferences, and conversation-history management

## 1. Summary

Every authenticated KidItem work surface gains immediate access to a conversation-first AI chat panel in the app shell's single right auxiliary surface. The Dashboard and ordinary work screens are where conversations naturally begin while the user works; Agent OS becomes the full history, search, settings, and conversation-resume workspace.

The workspace keeps provider-native model continuity and uses the local
CopilotKit OSS SQLite-runner semantics as the canonical interaction
event-history owner. The upstream package is used directly only when its
lifecycle/storage characterization passes; otherwise one narrow attributed
fork of that package supplies the missing contracts. It does
not add a KidItem PostgreSQL conversation model, paid CopilotKit service,
provider credential persistence, AgentVersion model policy, native-subagent
conversation rows, or a second task lifecycle.

The user-facing changes are:

- one global right auxiliary surface owned by the authenticated app shell;
- `notifications | ai_chat | null` as its complete visible-state model, where `null` means closed;
- one shared collapsible sidebar shell and interaction contract for Dashboard and
  Agent OS, with surface-specific navigation bodies;
- the existing bottom-sidebar `AI 챗` utility wired as the AI chat trigger without coupling chat state to sidebar composition;
- the existing Dashboard `Agent OS` organization chart, label, cards, and action semantics preserved without chat-driven redesign;
- an explicit Dashboard return action;
- one sidebar split into Agent and Chat sections;
- Agent conversations nested below their exact Agent folder and General
  conversations listed only in Chat;
- a modal-free General chat draft that creates a Conversation only on first send;
- a compact ChatGPT-style composer;
- General/Agent and Codex/Claude-specific default model and reasoning preferences;
- conversation search, rename, individual delete, folder delete, and delete-all controls; and
- removal of implementation terms such as Gateway, provider-local storage, descriptor, binding, and session-creation timing from the normal UI.

The approved visual direction is **original-design operational**. It restores
the information hierarchy and KidItem visual language from the accepted
brainstorming mockups instead of merely reskinning the current generic chat
layout. Existing production behavior such as approvals, Operation/resource
results, responsive navigation, and actionable error states is composed into
that design. It is not a pixel-for-pixel copy and does not reopen runtime
ownership.

## 2. Goals

1. Let a user open AI chat from every authenticated work screen without first navigating to Agent OS.
2. Keep an open conversation available while the user navigates between work screens.
3. Let a user return from Agent OS to the Dashboard without relying on browser history.
4. Make both the AI chat panel and Agent OS look and behave like first-party KidItem surfaces.
5. Let a user start ordinary General chat immediately without a setup dialog.
6. Organize top-level conversations as a familiar folder tree by General or Agent context.
7. Preserve the immutable Provider choice while allowing model and reasoning effort to change between turns.
8. Let the user configure useful defaults without moving provider policy into AgentVersion.
9. Let the user find, rename, and delete provider-native conversation history.
10. Preserve the existing live CopilotKit stream, capability cards, owner boundaries, and no-transcript-in-PostgreSQL rule while letting its SQLite runner own the full canonical AG-UI event replay for completed interactions.
11. Restore the accepted KidItem conversation visual hierarchy across Agent OS
    and the Dashboard dock without redesigning the Dashboard business surface.

## 3. Non-goals

- Persisting transcript messages or provider session history in KidItem PostgreSQL
- Using CopilotKit Intelligence, hosted CopilotKit persistence, or another paid CopilotKit service
- Adding `AgentSession`, generic Task, folder, archive, or retention-policy models
- Adding model, reasoning effort, Provider, credential, or provider-session fields to AgentVersion or CapabilityDefinition
- Showing native Codex/Claude subagents as top-level conversations
- Allowing a Conversation to change Provider after creation
- Adding automatic expiration or deletion of chat history
- Adding history export, sharing, favorites, or Agent creation
- Adding visual controls for unsupported attachment, microphone, voice, or media capabilities
- Fixing the final composition or order of the product navigation sidebar
- Making Dashboard navigation and Agent OS conversation history use identical
  information architecture
- Making chat lifecycle or state depend on one sidebar implementation
- Renaming, restructuring, or repurposing the Dashboard `Agent OS` organization chart and action cards
- Restoring an interaction gateway application or a separate port
- Replacing CopilotKit interaction ownership while implementing the visual refresh
- Treating the approved mockup as a reason to add decorative controls that have
  no production behavior

## 4. Product Vocabulary

User-facing labels use these names:

| Internal concept | User-facing label |
|---|---|
| `agentKey = null` | 일반 AI 챗 |
| `sourcing` | 소싱 Agent |
| `merchandising` | 상품 Agent |
| `supply` | 공급 Agent |
| `channel_operations` | 채널 운영 Agent |
| `advertising` | 광고 Agent |
| `codex_cli` | Codex |
| `claude_cli` | Claude |
| Provider runtime | 대화 엔진, only inside settings or the combined composer selector |

The normal workspace does not show `Gateway`, `provider-local`, `descriptor`, `execution binding`, `thread ID`, `runtime Agent ID`, or session-creation semantics.

## 5. Information Architecture

### 5.1 Global right auxiliary panel

The authenticated `AppLayout` owns one global right auxiliary panel and its launcher contract. Exactly one of the following states is visible:

```typescript
type ActiveRightSurface = 'notifications' | 'ai_chat' | null;
```

Selecting the already active surface closes it. Selecting the other surface replaces the current content in the same panel slot. Notification and AI chat content bodies are never mounted as competing right-side overlays.

After authentication succeeds, `AppLayout` also mounts exactly one route-stable
`ConversationProvider` and one `ConversationRuntimeHost`. CopilotKit owns the
interaction lifecycle for the selected Conversation: run, stream, connect,
running state, and stop. `ConversationRuntimeHost` is the route-stable
presentation adapter over that lifecycle; it must not recreate active-turn,
interrupt-acknowledgement, stale-settlement, or provider-history reconciliation
state. Ordinary route changes, including navigation between a work screen and
`/agent-os`, change only the presentation view; they do not unmount or duplicate
the CopilotKit interaction. The AI chat panel and Agent OS must never create two
active subscriptions for the same Conversation.

While `/agent-os` is active, the auxiliary AI chat body is suppressed because Agent OS already presents the selected Conversation. This does not clear the selected Conversation or stop the runtime host. Returning to an ordinary work screen restores the prior auxiliary-panel state without starting another subscription.

The existing bottom-sidebar `AI 챗` utility selects `ai_chat` wherever the ordinary KidItem sidebar is rendered. The notification trigger selects `notifications`. Both use the same app-shell controller. The AI chat utility remains available as an icon when the sidebar is collapsed. It is an app-shell utility, not a navigation route or an Agent OS tab.

The underlying right-surface controller does not live inside `Sidebar` or notification state. A future sidebar redesign can move or replace either launcher without changing conversation state, APIs, or the auxiliary panel. Authenticated full-screen surfaces that do not render the ordinary sidebar must provide the same AI chat launcher through their shell, unless the surface is Agent OS itself and already shows the active conversation. Login and public rendering surfaces never mount it.

Opening the global launcher:

- restores the currently selected conversation when one exists;
- otherwise opens an unsaved General draft;
- never creates a Conversation merely by opening the panel; and
- preserves the panel and selected conversation across ordinary client-side route navigation.

The existing Dashboard `Agent OS` region remains unchanged. Its `Agent OS` label, organization chart, business cards, and existing action semantics do not become chat launchers and are not renamed in this scope.

An Agent-bound draft is selected from the AI chat panel's new-conversation context menu or from the matching Agent OS folder `+` action. A future explicit domain entry point may call the same right-surface controller, but this design does not add or repurpose one inside the Dashboard `Agent OS` region.

The AI chat panel header contains:

- General or fixed Agent identity;
- conversation title when one exists;
- a new-conversation action that selects General or one of the five Agents;
- a close action;
- a Settings action; and
- `전체 기록`, which opens `/agent-os` at the current conversation or selected context.

At 1536 pixels and above (`2xl`), the auxiliary panel is a 352-pixel
non-modal dock that participates in `AppLayout` width. Opening it reduces the
Dashboard or current work-surface content width; it does not cover that content.
The uncovered work surface remains interactive. From 768 through 1535 pixels,
including a 1280-pixel Dashboard viewport, the same 352-pixel content uses a
right overlay sheet and does not reduce the work-surface width. Below 768 pixels
it becomes a full-width modal drawer. These are responsive presentations of one
panel state and one content body, not separate dock, overlay, and drawer
features.

The Quick Action FAB does not move in response to the panel. It is hidden while either auxiliary surface is open and restored when the panel closes. Notification data collection and the conversation runtime remain mounted independently from which panel content is visible. Replacing AI chat with notifications therefore hides only the chat presentation; it does not interrupt the active turn or discard the selected Conversation. The AI chat content has its own scroll region and reuses the same route-stable conversation stream, cards, composer, draft behavior, and Query state as Agent OS.

### 5.2 Agent OS history workspace

`/agent-os` remains a focused full-height workspace. It does not mount the complete Dashboard navigation sidebar because two simultaneous sidebars would reduce conversation space and duplicate navigation.

Agent OS is not the required starting point for ordinary chat. It is the complete conversation-history workspace for browsing folders, resuming a conversation, searching, renaming, deleting, and editing settings.

Dashboard and Agent OS use one shared sidebar shell for width, header geometry,
collapse controls, border, motion, focus, tooltip, and desktop preference. They
do not share their navigation body: Dashboard keeps its product/domain
navigation, while Agent OS projects Agent folders and conversation history.

The Agent OS shell contains:

1. the shared 256-pixel expanded sidebar or 64-pixel collapsed rail on desktop;
2. one conversation surface in the remaining viewport; and
3. a drawer version of the tree below 1024 pixels.

The expanded header places KidItem identity on the left and the shared collapse
control on the right. The collapsed rail renders a dedicated 40-by-40
KidItem/Dashboard control and a separate 40-by-40 expand control in the same
left-side shell; it never moves the expand action into `ConversationHeader` or
the far edge of the conversation. The explicit Dashboard action remains
available in expanded and collapsed states. KidItem identity and the Dashboard
action navigate to `/dashboard`. Browser Back remains available but is not the
product's primary return mechanism.

The existing app-shell UI state owns the desktop expanded/collapsed preference
for both Dashboard and Agent OS so route changes do not flip the rail
unexpectedly. This is local presentation state, not a Conversation, runtime, or
server preference. Mobile drawer open/closed state remains separate and is
never persisted as the desktop preference. Collapsing the shell does not unload
the selected Conversation or stop an active interaction.

The desktop shell deliberately does not mount the ordinary product-navigation
sidebar. The shared 256/64-pixel shell is the only navigation column, and the
conversation occupies the remaining viewport. The shell uses the KidItem mark,
purple selected state, neutral page background, and compact hierarchy from the
approved visual direction rather than the generic card-and-button density of
the interim implementation.

### 5.3 Agent and chat sections

The sidebar has exactly two visible sections:

1. `에이전트`, containing the stable order 소싱 Agent, 상품 Agent, 공급 Agent,
   채널 운영 Agent, 광고 Agent; and
2. `채팅`, containing only General conversations where `agentKey` is null,
   ordered by `updatedAt` descending.

Agent folders are a Web projection of `ConversationSummary.agentKey`. There is
no folder entity, folder API, or folder persistence schema. A conversation is
shown in exactly one section; Agent conversations are never duplicated in the
General chat list.

Visible section labels use at least 12-pixel text. `새 AI 대화` is the first
clear action by placement, label, icon, and focus order; it does not require a
full-width saturated purple slab. Primary violet is reserved for selected or
current state, the send action, focused controls, and other true primary
moments.

Each Agent folder:

- can be expanded or collapsed;
- shows its conversations ordered by `updatedAt` descending;
- has a `+` action that opens a new draft fixed to that General or Agent context; and
- shows rename and delete actions for each existing conversation.

Rename and delete are placed inside a row-level `•••` menu matching the compact
conversation-menu interaction of the approved ChatGPT reference. They are not
permanently rendered as text buttons beside every title. The active
conversation uses a quiet purple selection surface; folder-level `+` remains a
separate accessible action. Share, pin, archive, and move-to-project do not
appear as inert copies of ChatGPT controls. They require their own KidItem
product contracts before they can be added.

Expansion state is disposable UI state. Selecting an Agent conversation expands
its owner folder. Native provider subagents and tool activity stay inside the
parent conversation stream.

### 5.4 Conversation entry points

The tree has a visually primary `새 AI 대화` action. It opens an unsaved General draft immediately and focuses the composer. It does not open a runtime-selection modal and does not create a provider Conversation merely by opening or closing the draft.

The global sidebar `AI 챗` utility, any authenticated full-screen launcher, and the existing Quick Action entry call the same right-surface controller and use the same General draft behavior. The AI chat panel context menu and Agent OS folder actions call that controller with the exact fixed Agent key.

The existing Sourcing decision-center question action also calls this controller
with its fixed Sourcing context and prepared question. Its product label becomes
`소싱 Agent에게 묻기`; it no longer says `AgentOS에서 묻기` or navigates to
`/agent-os` merely to expose a composer.

No entry point owns transcript state, creates its own CopilotKit provider, or implements a separate conversation panel.

## 6. Conversation Creation and Selection

### 6.1 New draft

A draft contains only disposable browser state:

```typescript
type NewConversationDraft = {
  /** Browser-reserved ID; creating a draft still creates no Provider session. */
  conversationId: string;
  agentKey: AgentKey | null;
  provider: 'codex_cli' | 'claude_cli' | null;
  model: string | null;
  reasoningEffort: string | null;
  message: string;
};
```

The browser generates `conversationId` once when it opens a new draft and reuses it for every retry of that draft. Reserving this opaque ID creates no Provider session and writes no durable state. It becomes the local Conversation descriptor ID only after successful creation.

The draft contains no provider reference, transcript, capability grant, credential, Task, Attempt, or durable lifecycle state.

### 6.2 First send

The sequence is:

```text
Open General or Agent draft
  -> choose Codex or Claude
  -> apply valid context/provider preference
  -> user may change model and reasoning effort
  -> user sends the first message
  -> create provider Conversation with the exact draft conversationId
  -> Provider becomes immutable
  -> bind the CopilotKit conversation surface
  -> start the first turn with explicit model and reasoning effort
```

Provider may change while the draft is unsaved. It becomes immutable when Conversation creation succeeds. Opening and abandoning a draft produces no provider session and no conversation-list entry.

Conversation creation is idempotent at the native owner boundary. The same `conversationId` plus the same canonical runtime, Agent context, and title returns the existing Conversation without creating another Provider session. Reusing that ID with different canonical input is a conflict. The first-turn handoff is consumed at most once for that ID, so double-clicks, response loss, React remounts, and explicit retries cannot create duplicate Conversations or start the first turn twice.

The initial title is a deterministic, bounded title derived from the normalized first message. It does not require an LLM call. The user may rename it later.

If Conversation creation succeeds but the first provider turn fails, the created conversation remains visible and retryable. The composer preserves the first message and selected model/reasoning effort. This is an explicit failure recovery case, not an automatically resumed turn.

### 6.3 Existing conversation

An existing conversation fixes:

- Provider;
- General or one Agent context; and
- provider-local conversation identity.

The user may select a supported model and reasoning effort before every new turn. Changing Provider or Agent context requires a new top-level conversation.

## 7. Composer Design

The composer follows the attached ChatGPT reference's compact visual hierarchy
and direct model/reasoning menu interaction without copying unsupported
controls.

The global AI chat panel and Agent OS workspace render the same composer component and conversation flow. A conversation opened in the panel is the same provider Conversation when opened through `전체 기록`; it is not copied or restarted.

It consists of one rounded, border-first container with:

- a growing multiline text input;
- one compact combined selector, for example `Codex · GPT-5.6-sol · Max`;
- one circular Send button; and
- a circular Interrupt button in the same location while a turn is active.

The composer is visually elevated above the neutral conversation background
with a subtle shadow, not boxed inside an additional footer card. It stays
centered with the message column at approximately 720-768 pixels. Provider,
model, and reasoning effort read as one compact composed control; its segments
may open focused menus without becoming three unrelated settings panels.

Layout follows the composer's own available width rather than the browser
viewport. In the 352-pixel auxiliary panel, the growing textarea occupies a
full row and the combined selector plus Send/Interrupt occupy a second row. In
the full Agent OS message lane, they may share one horizontal row when the
container is wide enough. The selector must never reserve a fixed width that
collapses the textarea to a one-character column.

The combined selector opens one compact, keyboard-accessible menu with the
current selection visible at rest, following the approved ChatGPT interaction.
It exposes structured choices for:

- Codex or Claude while the conversation is still a draft;
- supported model; and
- supported reasoning effort for that model.

After Conversation creation, Provider remains visible but disabled; model and reasoning effort remain editable between turns.

The composer does not show nonfunctional attachment, microphone, voice, or media icons. Those controls require a separate supported product contract before appearing.

General uses the placeholder `무엇을 도와드릴까요?`. Agent drafts and conversations use `<Agent 이름>에게 무엇을 요청할까요?`.

An empty General or Agent draft uses a centered KidItem/Agent mark, a short
user-facing description, and up to three bounded suggestion chips. A suggestion
only fills the composer; it never invokes a capability or creates a
Conversation by itself. The panel and `/agent-os` render this exact shared empty
state for the same draft; neither adds a second warning-only or blank-body
variant. The visible copy and suggestions are operational and context-specific,
not generic AI filler. The sidebar already owns the New Chat action, so the
empty body does not repeat a second `새 AI 대화 시작` button.

Keyboard behavior:

- Enter sends when the IME composition is complete;
- Shift+Enter inserts a newline;
- Escape closes an open selector or menu; and
- every action has a visible focus state and accessible label.

## 8. User Preferences

### 8.1 Preference scope

Preferences are indexed by General/Agent context and Provider:

```typescript
type ConversationPreferenceContext = 'general' | AgentKey;

type ConversationPreference = {
  model: string;
  reasoningEffort: string;
};

type ConversationPreferences = {
  schemaVersion: 1;
  contexts: Partial<Record<
    ConversationPreferenceContext,
    Partial<Record<'codex_cli' | 'claude_cli', ConversationPreference>>
  >>;
};
```

These are user conversation preferences, not Agent execution policy. They are not stored in AgentVersion, CapabilityDefinition, CapabilityInvocation, or PostgreSQL.

### 8.2 Selection precedence

For a new draft:

1. use the selected General/Agent and Provider preference when it remains supported;
2. when no saved pair exists, leave model or reasoning effort unselected and
   present a neutral selection prompt; and
3. show the review warning only when an actually stored pair is no longer
   supported, then require explicit selection before Send.

For an existing conversation:

1. use its `lastModel` and `lastReasoningEffort` when supported;
2. otherwise use the matching General/Agent and Provider preference when supported;
3. otherwise require explicit selection.

There is no silent Provider, model, or reasoning-effort fallback.

All user-facing copy uses `추론 수준`. `사고 수준` is not a second term. A
fresh draft with no stored selection is not an error state, while a valid saved
default is applied immediately in both the Dashboard panel and Agent OS.

### 8.3 Storage ownership

The native Host Runner stores preferences as a strict, versioned, bounded local file alongside its existing conversation descriptor catalog. Writes are atomic, serialized, and use the same operating-system account protections as conversation descriptors.

The preference file contains no:

- credential or login token;
- provider conversation reference;
- transcript;
- capability input;
- Agent grant;
- approval or Operation state; or
- model fallback policy.

Preferences are scoped to the dedicated Host Runner installation user, matching the current single-user home-server product target. Nest requires the current authenticated user and organization fence before issuing preference read/update commands through the existing Host Runner control boundary, but organization ID is not a preference-storage key and does not create per-organization copies. Nest does not copy preferences into PostgreSQL.

### 8.4 Settings interface

A Settings action in the global AI chat panel and a Settings button at the bottom of the Agent OS conversation tree open the same dialog with:

- `대화 기본값`; and
- `채팅 기록`.

This is one centered dialog with a compact left settings navigation and one
content pane. It is not a full route, nested drawer, or runtime management
console. The history pane uses the same dialog and exposes search, filtering,
row overflow actions, and bounded destructive confirmations.

`대화 기본값` allows selection of:

- General or one of the five Agents;
- Codex or Claude;
- a currently supported model; and
- a supported reasoning effort.

Unavailable or obsolete stored selections appear as needing review. The UI never silently replaces them. Provider login, installation, and readiness recovery remain operator-owned runbook concerns; this dialog does not expose operational status, login controls, Gateway terminology, or Host Runner management.

## 9. Chat History Management

The `채팅 기록` settings section uses the current Gateway conversation catalog. It supports:

- case-insensitive title search;
- General/Agent context filtering;
- sorting by most recently active;
- rename;
- individual delete;
- delete all conversations in the selected folder; and
- delete all conversations.

Search and filtering are client projections over the bounded conversation summary list. No search index or database table is added.

### 9.1 Deletion

Deletion presents one Provider-independent user action while preserving the existing owner order:

```text
Provider-owned conversation removal
  -> local descriptor removal
  -> Web query cache removal
```

The native Provider adapter owns the concrete removal mechanism:

- Codex archives the exact Provider thread.
- Claude resolves the exact session below the canonical Claude project root and removes its main transcript plus exact session-owned subkeys or sidecars. It never accepts a path from Nest or Web.

A Conversation with a live turn is not deletable until that turn is interrupted or terminal. The Gateway may accept already-absent Provider state while deleting an existing exact descriptor. At the HTTP boundary, an absent or foreign descriptor cleans only the caller's namespaced local history and remains `404`. The UI removes a row only after success. A genuine failure leaves the conversation visible and retryable.

All conversation descriptor create, rename, turn-metadata update, and remove operations pass through one serialized store mutation queue. Atomic file replacement prevents torn files; serialization prevents concurrent read-modify-write operations from restoring deleted rows or losing newer metadata.

Bulk deletion may use small bounded concurrency for Provider-owned removal, but every descriptor mutation remains serialized. Partial Provider failures are observable and retryable. Before execution, the confirmation dialog shows the exact scope and conversation count. The result reports success and failure counts and retains every failed row.

There is no Archive state, automatic retention period, soft-delete model, or restore workflow in this scope.

## 10. Visual Language

The global AI chat panel and Agent OS use the same semantic tokens and interaction language as the Dashboard:

- semantic KidItem violet (`--primary`, `#7c3aed`) for primary actions,
  selected conversation, and focus;
- neutral page, card, sunken, border, and text tokens;
- the existing system font and Lucide icons;
- border-first hierarchy with shadows only for dialogs, popovers, and composer elevation;
- 8/12/16/24/32-pixel visible spacing rhythm;
- 8-pixel navigation/action radii and a 24-28-pixel outer composer radius; and
- 100-150 millisecond reduced-motion-aware state transitions.

The semantic palette is one explicit contract: ink `#0f172a`, canvas
`#ffffff`, work surface `#f8fafc`, signal violet `#7c3aed`, dialogue purple
`#4c1d95`, and evidence mint `#ecfdf5`. `DESIGN.md`, CSS variables, and
Tailwind semantic aliases must describe these same values; the older
`purple-600 #9333ea` documentation is not a competing source. Components use
semantic tokens rather than literal Tailwind palette names.

The panel and workspace adopt ChatGPT's proven conversation-shell interaction:
a collapsible history sidebar, compact row menus, a centered message column,
visually distinct user messages, plain-canvas assistant responses, and a compact
composer with model/reasoning controls. They do not copy ChatGPT branding,
logos, assets, or unsupported product actions. KidItem's violet tokens, Agent
folders, capability cards, and Dashboard semantics remain authoritative.

Production styling continues to obey `DESIGN.md`: light theme only, semantic
violet/slate tokens, system font, and Lucide icons. Gradient marks and symbolic
glyphs used in brainstorming HTML are visual shorthand, not production assets;
the implementation does not add decorative gradients, emoji icons, or a second
font stack.

### 10.1 Agent OS composition

The approved Agent OS composition is:

```text
shared 256px sidebar / 64px collapsed rail
  -> KidItem mark + always-available Dashboard return
  -> sidebar-local collapse / expand control
  -> quiet primary New AI conversation action
  -> Agent section with five Agent folders
  -> Chat section with General conversations
  -> nested conversation rows with overflow actions
  -> conversation settings

remaining viewport
  -> quiet title/context header
  -> centered 720-768px conversation column
  -> user bubble / assistant response / business result cards
  -> shared compact composer
```

User messages use a fully opaque, deep-purple, right-aligned bubble with white
text. This applies the strong visual separation of the approved live ChatGPT
reference through KidItem's own brand token; transparent or opacity-modified
surfaces are not allowed. Assistant responses use an opaque white conversation
canvas without a large enclosing bubble. Agent identity appears once at the
start of an assistant response group. This keeps long answers readable while
preserving source identity.

Assistant prose has a readable hierarchy for paragraphs, bounded lists,
headings, links, inline code, and code blocks rather than preserving the whole
response as one undifferentiated text node. Rendering is presentation-only and
does not expose private reasoning or interpret raw provider payloads.

Evidence, Approval, Operation, and resource results remain first-class product
UI, but they are rendered as compact cards inside the assistant flow:

- evidence cards show bounded business evidence and links, not raw provider payloads;
- Approval cards show the exact user-relevant target, effect, and confirm/cancel actions;
- Operation cards show business progress/result language without lifecycle internals; and
- technical correlation IDs remain absent from the normal presentation.

Related read evidence, approval, Operation, and resource outcomes form a
compact `업무 증거` rail inside the assistant response group. The rail names
the user-visible business outcome (`무엇을 조회했는지`, `무엇을 승인하는지`,
`무엇이 생성되었는지`) instead of repeating a generic `업무 처리 완료`
heading. It does not reveal capability keys, tool names, provider payloads,
request hashes, or internal identifiers, and it never invents progress that is
not present in canonical projections.

Errors appear next to the action or message they affect. A global readiness
banner is used only when no conversation action can proceed. Normal empty and
idle states never advertise Gateway connectivity or provider storage details.

### 10.2 Dashboard dock composition

The Dashboard `Agent OS` organization chart, title, cards, metrics, and business
actions remain visually and behaviorally unchanged. The only additions are the
bottom-sidebar `AI 챗` launcher and the shared right auxiliary dock.

The dock uses the same title hierarchy, message treatment, business cards, and
composer as Agent OS at a compact width. Its header contains context/title, New,
Settings, `전체 기록`, and Close. `전체 기록` changes presentation to
`/agent-os` for the same Conversation; Close hides presentation only. Neither
action restarts, clones, or deletes the provider Conversation.

The compact dock uses the same empty-state component and preference resolution
as Agent OS. Its composer always gives the message input a full-width row and
places model/`추론 수준` plus Send/Interrupt below it; it never compresses the
Dashboard message input to make the wide-workspace layout fit.

### 10.3 New conversation and settings

Before first Send, Provider, model, and reasoning effort remain explicit in the
composer. After creation, Provider is visibly fixed while model and reasoning
effort remain editable between turns. The UI explains Provider immutability in
user language only when it is relevant; it does not expose the descriptor or
provider-session mechanism.

The centered Settings dialog uses two stable sections, `대화 기본값` and
`채팅 기록`. Destructive history actions remain subordinate to everyday
defaults and search rather than dominating the conversation tree.

## 11. Responsive and Accessibility Behavior

- The global right auxiliary surface has exactly `notifications | ai_chat | null` visible states; `null` means closed.
- Selecting one surface atomically replaces the other; selecting the active surface closes the panel.
- At 1536 pixels and above (`2xl`), the 352-pixel panel is a non-modal
  dock and the current work surface uses the remaining width.
- From 768 through 1535 pixels, the same 352-pixel content is a
  right overlay sheet.
- Below 768 pixels, the same panel becomes a full-width modal drawer.
- Desktop dock and tablet overlay presentations do not trap focus or block the
  usable work surface; the mobile modal drawer traps focus until dismissed.
- The Quick Action FAB never repositions and remains hidden while the auxiliary panel is open.
- Panel state and the selected conversation survive ordinary client-side route navigation.
- Switching to notifications or closing the panel does not interrupt an active chat turn.
- At 1024 pixels and above, the Agent OS shared sidebar is 256 pixels expanded
  or 64 pixels collapsed.
- Below 1024 pixels, the tree becomes a modal drawer and the conversation keeps the full content width.
- The 352-pixel composer uses its narrow two-row layout regardless of viewport;
  smaller mobile widths retain the same usable-input invariant.
- Conversation and tree scroll regions remain independent.
- The global `AI 챗` utility remains keyboard reachable when the ordinary sidebar is expanded or collapsed.
- Dashboard and Agent OS share the desktop collapse preference, 256/64 geometry,
  control iconography, border, 100-150 ms motion, and focus treatment; their
  navigation bodies remain different.
- Expanded and collapsed Agent OS states keep a 40-by-40 Dashboard action and a
  40-by-40 collapse/expand action in the left shell. Touch/mobile targets are at
  least 44-by-44.
- The Dashboard return action precedes conversation content in Agent OS keyboard order.
- Folder controls expose expanded state with `aria-expanded`.
- The selected conversation uses `aria-current`.
- Menus and settings dialogs return focus to their trigger.
- Destructive actions require a confirmation dialog with exact scope and count.
- Status and error messages use live regions without exposing internal error codes.

## 12. Error Handling

| Condition | User-facing behavior |
|---|---|
| Codex/Claude unavailable | State only that the selected conversation engine cannot currently be used. Preserve the draft or existing conversation and offer Retry; a draft may select another available Provider. Do not expose operator login or readiness controls in the product UI. |
| Stored model no longer supported | Mark the combined selector and require reselection |
| Conversation creation failure | Preserve draft, Provider, model, reasoning effort, and message for retry |
| First turn failure after creation | Keep the new conversation visible and preserve the message for explicit retry |
| History load failure | Preserve the current surface and offer Retry |
| Rename failure | Keep the previous title |
| Individual delete failure | Keep the conversation row and show a retryable error |
| Bulk delete partial failure | Report exact success/failure counts and retain failed rows |
| Preference read failure | Require explicit model/reasoning selection; do not invent defaults |
| Preference write failure | Keep the prior saved preference and show Save failed |

User messages do not contain `Gateway`, `descriptor`, `provider-local`, `binding`, raw Provider errors, or internal IDs.

## 13. Component and Ownership Changes

Expected Web ownership:

- `AppLayout` owns one authenticated, route-stable `ConversationProvider`, `ConversationRuntimeHost`, and right auxiliary panel mount, and passes the existing launchers explicit surface-selection callbacks.
- one focused shared collapsible sidebar shell owns only desktop 256/64 geometry,
  header/rail controls, motion, accessibility, and the shared presentation
  preference; Dashboard `Sidebar` and Agent OS `ConversationFolderTree` provide
  different body/footer content through that shell.
- `Sidebar` remains a launcher only and does not own conversation state or the
  Agent OS conversation tree.
- a focused `RightAuxiliaryPanel` owns the shared shell, focus behavior, dismissal, and desktop/mobile presentation.
- `NotificationPanelContent` and `ConversationPanel` are mutually exclusive bodies of that shell; neither owns the global right-surface state.
- `ConversationPanel` and the Agent OS workspace are presentation views over the same runtime host; neither independently mounts `useAgent` for the selected Conversation.
- `AgentConversationSurface` remains a focused Agent OS history-workspace
  composition and does not absorb runtime, settings, history mutation, or card
  behavior.
- `ConversationFolderTree` replaces the old flat `AgentConversationSidebar`; the
  old component and export are deleted rather than retained as a wrapper.
- a focused new-draft hook owns unsaved first-message state and creation handoff.
- `AgentConversationComposer` owns compact input and the combined selector and is shared by panel and workspace modes.
- shared presentation primitives own safe assistant-response hierarchy, message
  grouping, the compact business-evidence rail, and Evidence, Approval,
  Operation, and resource card styling; they do not own runtime state or domain
  behavior.
- Agent OS and Dashboard panel compositions may select full and compact visual
  variants, but they consume the same conversation data and CopilotKit
  interaction.
- a settings dialog owns preference and history-management views.
- React Query remains the owner of conversation summaries, readiness,
  preferences, and business-resource queries. The CopilotKit OSS SQLite runner
  records and replays full canonical AG-UI events for completed interactions
  through `connect`; Web and the
  provider-history control plane do not keep a second history/reconciliation
  owner. Provider-local sessions remain solely for model continuity.
- the app-shell UI store holds one `activeRightSurface` and the shared desktop
  sidebar preference; conversation UI state holds only open folder, selected
  conversation, pending draft, and dialog coordinates. Mobile drawer state
  remains component-local.

Expected backend ownership:

- Agent OS authenticated HTTP remains the Web incoming boundary.
- the existing Gateway conversation port remains the conversation owner adapter;
  its bounded descriptor persists the server-derived organization and hides it
  from public summaries and provider metadata.
- Conversation access is shared within that organization and hidden from every
  other organization; initiating-user ownership remains only on the live Turn
  in Nest.
- the native Host Runner owns the strict local preference store and provider conversation deletion.
- one API-local CopilotKit SQLite file owns completed interaction events, is namespaced by
  server-authenticated organization plus Conversation, and is deleted with the
  exact provider Conversation; it stores no credential, bearer/token, raw
  provider payload, or private reasoning.
- Nest's in-memory active-turn record remains the only execution authority;
  SQLite never resumes reasoning or persists a lock that can block the next
  explicit turn after API restart.
- no business domain or Prisma adapter participates.

The existing notification `PanelSheet` shell and the future AI chat shell must
contract into one `RightAuxiliaryPanel`; their domain-specific contents remain
separate. `PanelSheet` is renamed and reduced to `NotificationPanelContent`,
with no Dialog shell, compatibility export, or hidden wrapper left behind. The
existing split between shared conversation flow, Dashboard panel composition,
and Agent OS history composition remains. Visual work must not move interaction
lifecycle back into a large Web component or expand `ConversationRuntimeHost`
with presentation-specific state.

### 13.1 Clean cutover and legacy removal

This is a clean replacement, not a compatibility migration. The implementation
removes every superseded presentation path in the same change:

- delete the old `PanelSheet` component name, import path, Dialog shell, and
  `PanelSheet`-named tests after moving its notification body into
  `NotificationPanelContent`; replace the old `PanelMount` wrapper with a
  data-only `NotificationDataMount` that renders no hidden UI;
- remove `panel-store.isOpen`, `panel-store.setOpen`,
  `kiditem.panel.open`, and their fixtures. `activeRightSurface` is the only
  presentation-state authority and the obsolete localStorage value is simply
  ignored rather than migrated;
- remove notification-row code that mutates the retired panel-open state.
  Ordinary route navigation preserves the app-shell right-surface selection;
- delete `AgentConversationSidebar` after `ConversationFolderTree` takes over;
- remove the route-local ConversationProvider branch, the old
  `CreateConversationDialog`, `pendingOpen`, `consumePendingOpen`, and automatic
  `/agent-os` navigation and `AgentOS에서 묻기` label used only to expose chat;
  and
- remove obsolete mocks, fixtures, exports, and tests together with each deleted
  production path.

No dual-write state, compatibility alias, deprecated prop, hidden component, or
one-time migration is added. Notification SSE/data recovery remains mounted
because it is active product behavior; only its retired presentation lifecycle
is removed. ConversationRuntimeHost likewise remains mounted independently of
whether its presentation body is visible, but it remains a presentation adapter
rather than a second interaction lifecycle owner.

## 14. Verification

### 14.1 Web behavior

- existing bottom-sidebar `AI 챗` utility selects the global AI chat panel while remaining independent of menu definitions
- Dashboard and Agent OS use the same 256/64 shared sidebar shell contract,
  collapse preference, labelled 40-pixel controls, focus treatment, and
  reduced-motion transition while retaining different bodies
- Agent OS Dashboard return remains available when the sidebar is collapsed,
  and the expand control never moves into the conversation header
- the exact `notifications | ai_chat | null` state machine, including same-trigger close and cross-trigger replacement
- panel state and active conversation survive ordinary route navigation
- one CopilotKit interaction, subscription, live projection, and stop control
  survive AI Chat panel -> Agent OS -> Dashboard navigation without remount or
  duplication
- Agent OS suppresses the auxiliary AI chat body without clearing its selected Conversation, and returning restores the prior panel state
- while Agent OS suppresses `ai_chat`, an already-selected `notifications`
  surface remains available because only the duplicate chat presentation is
  excluded
- desktop `2xl` auxiliary dock uses exactly 352 pixels and reduces Dashboard
  content width without covering it
- 768-1535 presentation uses the same 352-pixel body as an overlay sheet without
  reducing Dashboard width, and the mobile presentation uses a full-width modal
  drawer below 768 pixels
- Quick Action FAB is hidden without repositioning while either auxiliary surface is open
- notification selection and panel close do not interrupt an active chat turn
- Dashboard `Agent OS` label, organization chart, cards, and existing actions remain unchanged
- AI chat panel new-conversation context menu opens an Agent-bound draft without touching Dashboard Agent UI
- `전체 기록` opens Agent OS at the current conversation or context
- AI chat panel and Agent OS reuse one conversation flow without duplicate transcript state
- Dashboard return and one canonical KidItem visual-token contract across
  `DESIGN.md`, CSS variables, and semantic Tailwind aliases
- 256-pixel expanded/64-pixel collapsed desktop conversation tree with row
  actions in an overflow menu and readable 12-pixel section labels
- opaque deep-purple user messages with white text, neutral assistant groups,
  structured assistant prose, centered message column, and a compact
  user-language `업무 증거` rail for business result cards
- one shared empty draft across panel and Agent OS; a fresh untouched draft has
  no invalid-selection warning, while a valid saved default is applied
- narrow panel composer keeps a full-width textarea row with selector and
  Send/Interrupt below it
- centered Settings dialog with `대화 기본값 | 채팅 기록`
- no visible Gateway, provider-local, descriptor, binding, transport, active-turn,
  or execution-ID label in normal idle and success states
- exactly two sections: Agent folders in stable order and General-only Chat
- Agent-folder expansion, selection, non-duplicated sessions, and `updatedAt`
  ordering
- primary General draft and folder-specific Agent drafts
- no Conversation API call merely from opening or closing a draft
- first Send creates the conversation and fixes Provider
- same reserved conversation ID plus the same canonical create input replays one Conversation; input drift conflicts
- double-click, response-loss retry, and React remount do not create a duplicate Conversation or start the first turn twice
- combined selector supports Provider only before creation and model/effort between turns
- General/Agent plus Provider preference selection
- existing conversation last-selection precedence
- invalid stored selection requires explicit user action and uses only the term
  `추론 수준`; an absent untouched selection uses a neutral prompt
- search, folder filter, rename, individual delete, folder delete, and delete all
- partial bulk-delete result behavior
- keyboard, focus transfer between auxiliary surfaces, focus return, IME-safe Enter, reduced motion, and responsive drawer
- Invocation, Operation, resource cards, authenticated history snapshots, and
  live CopilotKit message regressions
- no `PanelSheet`, `AgentConversationSidebar`, route-local provider branch,
  `CreateConversationDialog`, `pendingOpen`, panel `isOpen`/`setOpen`, or
  `kiditem.panel.open` production path remains

### 14.2 Server and Host Runner behavior

- strict preference input/output schemas
- organization and current-user fence on preference and conversation-catalog APIs
- atomic preference-file writes and invalid-file rejection
- serialized preference and conversation-descriptor mutations under concurrent requests
- installation-user preference scope without per-organization copies
- no secret, credential, transcript, provider reference, or execution binding in preferences
- create only on first Send
- immutable Provider and Agent binding after creation
- same existing delete ordering: Provider first, descriptor second
- Codex archive and Claude exact session/subkey deletion satisfy the same product deletion contract
- deletion rejects a live turn; an absent or foreign descriptor cleans only the caller namespace and remains `404`, while an already-absent Provider state may still be accepted for an existing descriptor
- concurrent rename, turn metadata update, individual delete, and bulk delete cannot lose or restore descriptor state
- bulk operation partial failure remains retryable

### 14.3 Browser QA

Run authenticated browser QA for:

1. open General chat from the bottom-sidebar utility on multiple authenticated routes;
2. keep the AI chat panel and active conversation while navigating between work screens, and keep one live turn while navigating AI Chat panel -> Agent OS -> Dashboard;
3. verify the Dashboard `Agent OS` label, organization chart, cards, and existing actions are unchanged;
4. open an Agent-bound draft from the AI chat panel context menu;
5. open the same conversation through `전체 기록` and return to Dashboard;
6. immediate General chat start;
7. Agent-folder chat start;
8. model/reasoning override between turns;
9. settings save and reuse in a new draft;
10. rename, search, individual delete, and confirmed bulk delete against disposable Codex and Claude QA conversations;
11. Agent OS suppressing only the duplicate AI chat body while preserving its runtime and any selected notification body;
12. focus transfer when replacing notification/chat content and focus return after close or Escape;
13. 1536-plus 352-pixel push dock, 768-1535 overlay sheet, mobile full-width
    drawer, Agent OS 256/64 desktop sidebar, and Agent OS tree-drawer layouts;
14. visual regression checks for the approved Agent OS full workspace, Dashboard
    dock, empty draft, Settings defaults, history list, evidence result, and
    Approval card states;
15. Dashboard and Agent OS sidebar collapse/expand, Dashboard return in both
    states, route-stable desktop preference, labelled controls, keyboard focus,
    touch targets, and reduced motion;
16. the same new-draft empty state and valid saved default in Dashboard and
    Agent OS, plus the narrow two-row composer at 352 pixels;
17. visually distinct user messages, structured assistant prose, and business
    evidence phrased without generic completion copy or internal identifiers;
    and
18. console/network checks confirming one conversation transport, no retired Agent OS endpoints, and no internal-error toasts.

## 15. Schema and Deployment Impact

- Prisma schema: no change
- KidItem durable business data: no change
- Nginx/public ports: no change
- CopilotKit endpoint: no change
- public route and sidebar-menu schema: no required change
- Host Runner state: one versioned, bounded preference file
- Provider login state: no change
- Windows/macOS process lifecycle: no change

This is a focused global conversation-access, shared sidebar-shell,
history-workspace UX, and Host Runner preference extension. It standardizes
sidebar geometry and interaction without deciding the final Dashboard
navigation composition, and it does not reopen KID-25 lifecycle, capability,
approval, MCP, or database architecture.
