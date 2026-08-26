# Agent OS Chat Workspace UX Design

**Date:** 2026-08-26  
**Status:** Ready for review  
**Scope:** KID-25 global chat dock, Agent OS history workspace, Gateway-local conversation preferences, and conversation-history management

## 1. Summary

Every authenticated KidItem work surface gains immediate access to a conversation-first AI chat dock. The Dashboard and ordinary work screens are where conversations naturally begin while the user works; Agent OS becomes the full history, search, settings, and conversation-resume workspace.

The workspace keeps its existing provider-native conversation architecture. It does not add a KidItem database conversation model, provider credential persistence, AgentVersion model policy, native-subagent conversation rows, or a second task lifecycle.

The user-facing changes are:

- a global right-side AI chat dock owned by the authenticated app shell;
- the existing bottom-sidebar `AI 챗` utility wired as the normal dock trigger without coupling chat state to sidebar composition;
- Dashboard Agent entry points that open an Agent-bound draft in the same dock;
- an explicit Dashboard return action;
- one folder tree containing General chat and the five code-owned Agents;
- conversations nested below their General or Agent folder;
- a modal-free General chat draft that creates a Conversation only on first send;
- a compact ChatGPT-style composer;
- General/Agent and Codex/Claude-specific default model and reasoning preferences;
- conversation search, rename, individual delete, folder delete, and delete-all controls; and
- removal of implementation terms such as Gateway, provider-local storage, descriptor, binding, and session-creation timing from the normal UI.

## 2. Goals

1. Let a user open AI chat from every authenticated work screen without first navigating to Agent OS.
2. Keep an open conversation available while the user navigates between work screens.
3. Let a user return from Agent OS to the Dashboard without relying on browser history.
4. Make both the chat dock and Agent OS look and behave like first-party KidItem surfaces.
5. Let a user start ordinary General chat immediately without a setup dialog.
6. Organize top-level conversations as a familiar folder tree by General or Agent context.
7. Preserve the immutable Provider choice while allowing model and reasoning effort to change between turns.
8. Let the user configure useful defaults without moving provider policy into AgentVersion.
9. Let the user find, rename, and delete provider-native conversation history.
10. Preserve the existing live CopilotKit stream, capability cards, owner boundaries, and no-transcript-in-PostgreSQL rule.

## 3. Non-goals

- Persisting transcript messages or provider session history in KidItem PostgreSQL
- Adding `AgentSession`, generic Task, folder, archive, or retention-policy models
- Adding model, reasoning effort, Provider, credential, or provider-session fields to AgentVersion or CapabilityDefinition
- Showing native Codex/Claude subagents as top-level conversations
- Allowing a Conversation to change Provider after creation
- Adding automatic expiration or deletion of chat history
- Adding history export, sharing, favorites, or Agent creation
- Adding visual controls for unsupported attachment, microphone, voice, or media capabilities
- Fixing the final composition or order of the product navigation sidebar
- Making chat lifecycle or state depend on one sidebar implementation
- Restoring an interaction gateway application or a separate port

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

### 5.1 Global chat dock

The authenticated `AppLayout` owns one global conversation dock and its launcher contract. The dock is mounted independently from route content, Dashboard composition, and sidebar menu definitions.

The existing bottom-sidebar `AI 챗` utility is wired to this dock wherever the ordinary KidItem sidebar is rendered. It remains available as an icon when the sidebar is collapsed. It is an app-shell utility, not a navigation route or an Agent OS tab.

The underlying dock controller does not live inside `Sidebar`. A future sidebar redesign can move or replace its launcher without changing conversation state, APIs, or the dock. Authenticated full-screen surfaces that do not render the ordinary sidebar must provide the same launcher through their shell, unless the surface is Agent OS itself and already shows the active conversation. Login and public rendering surfaces never mount it.

Opening the global launcher:

- restores the currently selected conversation when one exists;
- otherwise opens an unsaved General draft;
- never creates a Conversation merely by opening the panel; and
- preserves the panel and selected conversation across ordinary client-side route navigation.

The Dashboard Agent cards and other explicit domain entry points may open the same dock with a fixed Agent draft. They do not create a second chat implementation.

The dock header contains:

- General or fixed Agent identity;
- conversation title when one exists;
- a close action;
- a Settings action; and
- `전체 기록`, which opens `/agent-os` at the current conversation or selected context.

At wide desktop sizes the dock occupies a bounded right column and keeps the work surface visible. At narrower sizes it becomes an overlay drawer. It has its own scroll region and reuses the same conversation stream, cards, composer, draft behavior, and Query state as Agent OS.

### 5.2 Agent OS history workspace

`/agent-os` remains a focused full-height workspace. It does not mount the complete Dashboard navigation sidebar because two simultaneous sidebars would reduce conversation space and duplicate navigation.

Agent OS is not the required starting point for ordinary chat. It is the complete conversation-history workspace for browsing folders, resuming a conversation, searching, renaming, deleting, and editing settings.

The Agent OS shell contains:

1. a 288-pixel conversation tree on desktop;
2. one conversation surface in the remaining viewport; and
3. a drawer version of the tree below 1024 pixels.

The tree header contains KidItem identity and an explicit `← 대시보드` action. Both the return action and KidItem mark navigate to `/dashboard`. Browser Back remains available but is not the product's primary return mechanism.

### 5.3 Folder tree

The stable folder order is:

1. 일반 AI 챗
2. 소싱 Agent
3. 상품 Agent
4. 공급 Agent
5. 채널 운영 Agent
6. 광고 Agent

Folders are a Web projection of `ConversationSummary.agentKey`. There is no folder entity, folder API, or folder persistence schema.

Each folder:

- can be expanded or collapsed;
- shows its conversations ordered by `updatedAt` descending;
- has a `+` action that opens a new draft fixed to that General or Agent context; and
- shows rename and delete actions for each existing conversation.

Expansion state is disposable UI state. Selecting a conversation expands its owner folder. Native provider subagents and tool activity stay inside the parent conversation stream.

### 5.4 Conversation entry points

The tree has a visually primary `새 AI 대화` action. It opens an unsaved General draft immediately and focuses the composer. It does not open a runtime-selection modal and does not create a provider Conversation merely by opening or closing the draft.

The global sidebar `AI 챗` utility, any authenticated full-screen launcher, the Dashboard entry, and the existing Quick Action entry call the same dock controller and use the same General draft behavior. A domain Agent entry calls that controller with the exact fixed Agent key.

No entry point owns transcript state, creates its own CopilotKit provider, or implements a separate conversation panel.

## 6. Conversation Creation and Selection

### 6.1 New draft

A draft contains only disposable browser state:

```typescript
type NewConversationDraft = {
  agentKey: AgentKey | null;
  provider: 'codex_cli' | 'claude_cli' | null;
  model: string | null;
  reasoningEffort: string | null;
  message: string;
};
```

It contains no provider reference, transcript, capability grant, credential, Task, Attempt, or durable lifecycle state.

### 6.2 First send

The sequence is:

```text
Open General or Agent draft
  -> choose Codex or Claude
  -> apply valid context/provider preference
  -> user may change model and reasoning effort
  -> user sends the first message
  -> create provider Conversation
  -> Provider becomes immutable
  -> bind the CopilotKit conversation surface
  -> start the first turn with explicit model and reasoning effort
```

Provider may change while the draft is unsaved. It becomes immutable when Conversation creation succeeds. Opening and abandoning a draft produces no provider session and no conversation-list entry.

The initial title is a deterministic, bounded title derived from the normalized first message. It does not require an LLM call. The user may rename it later.

If Conversation creation succeeds but the first provider turn fails, the created conversation remains visible and retryable. The composer preserves the first message and selected model/reasoning effort. This is an explicit failure recovery case, not an automatically resumed turn.

### 6.3 Existing conversation

An existing conversation fixes:

- Provider;
- General or one Agent context; and
- provider-local conversation identity.

The user may select a supported model and reasoning effort before every new turn. Changing Provider or Agent context requires a new top-level conversation.

## 7. Composer Design

The composer follows the attached ChatGPT reference's compact visual hierarchy without copying unsupported controls.

The global dock and Agent OS workspace render the same composer component and conversation flow. A conversation opened in the dock is the same provider Conversation when opened through `전체 기록`; it is not copied or restarted.

It consists of one rounded, border-first container with:

- a growing multiline text input;
- one compact combined selector, for example `Codex · GPT-5.6-sol · Max`;
- one circular Send button; and
- a circular Interrupt button in the same location while a turn is active.

The combined selector opens structured choices for:

- Codex or Claude while the conversation is still a draft;
- supported model; and
- supported reasoning effort for that model.

After Conversation creation, Provider remains visible but disabled; model and reasoning effort remain editable between turns.

The composer does not show nonfunctional attachment, microphone, voice, or media icons. Those controls require a separate supported product contract before appearing.

General uses the placeholder `무엇을 도와드릴까요?`. Agent drafts and conversations use `<Agent 이름>에게 무엇을 요청할까요?`.

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
2. otherwise leave model or reasoning effort unselected; and
3. require explicit selection before Send.

For an existing conversation:

1. use its `lastModel` and `lastReasoningEffort` when supported;
2. otherwise use the matching General/Agent and Provider preference when supported;
3. otherwise require explicit selection.

There is no silent Provider, model, or reasoning-effort fallback.

### 8.3 Storage ownership

The native Host Runner stores preferences as a strict, versioned, bounded local file alongside its existing conversation descriptor catalog. Writes are atomic and use the same operating-system account protections as conversation descriptors.

The preference file contains no:

- credential or login token;
- provider conversation reference;
- transcript;
- capability input;
- Agent grant;
- approval or Operation state; or
- model fallback policy.

Nest exposes authenticated, organization-scoped preference read/update commands through the existing Host Runner control boundary. It does not copy preferences into PostgreSQL.

### 8.4 Settings interface

A Settings action in the global dock and a Settings button at the bottom of the Agent OS conversation tree open the same dialog with:

- `대화 기본값`; and
- `채팅 기록`.

`대화 기본값` allows selection of:

- General or one of the five Agents;
- Codex or Claude;
- a currently supported model; and
- a supported reasoning effort.

Unavailable or obsolete stored selections appear as needing review. The UI never silently replaces them.

## 9. Chat History Management

The `채팅 기록` settings section uses the current Gateway conversation catalog. It supports:

- case-insensitive title search;
- General/Agent folder filtering;
- sorting by most recently active;
- rename;
- individual delete;
- delete all conversations in the selected folder; and
- delete all conversations.

Search and filtering are client projections over the bounded conversation summary list. No search index or database table is added.

### 9.1 Deletion

Deletion preserves the existing owner order:

```text
Provider conversation delete/archive
  -> local descriptor removal
  -> Web query cache removal
```

The UI removes a row only after success. A failure leaves the conversation visible and retryable.

Bulk deletion uses bounded-concurrency individual deletes so partial Provider failures are observable and retryable. Before execution, the confirmation dialog shows the exact scope and conversation count. The result reports success and failure counts and retains every failed row.

There is no Archive state, automatic retention period, soft-delete model, or restore workflow in this scope.

## 10. Visual Language

The global chat dock and Agent OS use the same semantic tokens and interaction language as the Dashboard:

- KidItem purple for primary actions, selected conversation, and focus;
- neutral page, card, sunken, border, and text tokens;
- the existing system font and Lucide icons;
- border-first hierarchy with shadows only for dialogs, popovers, and composer elevation;
- 8/12/16/24/32-pixel visible spacing rhythm;
- 8-pixel navigation/action radii and a 12-14-pixel composer radius; and
- 100-150 millisecond reduced-motion-aware state transitions.

The dock and workspace are not ChatGPT clones. The screenshot informs the compact composer hierarchy only. KidItem's branding, Agent folders, capability cards, and Dashboard semantics remain authoritative.

## 11. Responsive and Accessibility Behavior

- At 1280 pixels and above, the global dock uses a bounded 400-480-pixel right column and keeps the underlying work surface visible.
- Below 1280 pixels, the global dock becomes an overlay drawer so route layouts do not collapse.
- Dock open state and the selected conversation survive ordinary client-side route navigation.
- At 1024 pixels and above, the Agent OS 288-pixel folder tree remains visible.
- Below 1024 pixels, the tree becomes a modal drawer and the conversation keeps the full content width.
- Below 640 pixels, composer controls wrap without placing the selector over the input.
- Conversation and tree scroll regions remain independent.
- The global `AI 챗` utility remains keyboard reachable when the ordinary sidebar is expanded or collapsed.
- The Dashboard return action is first in Agent OS keyboard order.
- Folder controls expose expanded state with `aria-expanded`.
- The selected conversation uses `aria-current`.
- Menus and settings dialogs return focus to their trigger.
- Destructive actions require a confirmation dialog with exact scope and count.
- Status and error messages use live regions without exposing internal error codes.

## 12. Error Handling

| Condition | User-facing behavior |
|---|---|
| Codex/Claude unavailable | Explain that the selected conversation engine cannot currently be used and link to Settings |
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

- `AppLayout` owns one global dock mount and passes the existing `Sidebar` utility a toggle callback.
- `Sidebar` remains a launcher only and does not own conversation state or final sidebar composition.
- a focused `ConversationDock` renders the active conversation beside authenticated route content.
- `AgentConversationSurface` becomes the Agent OS history-workspace composition and is split before additional behavior makes it larger.
- `AgentConversationSidebar` becomes a folder-tree composition.
- a focused new-draft hook owns unsaved first-message state and creation handoff.
- `AgentConversationComposer` owns compact input and the combined selector and is shared by dock and workspace modes.
- a settings dialog owns preference and history-management views.
- React Query remains the owner of conversation summaries, history, readiness, and preferences.
- Zustand holds only dock open, open folder, selected conversation, pending draft, and dialog UI coordinates.

Expected backend ownership:

- Agent OS authenticated HTTP remains the Web incoming boundary.
- the existing Gateway conversation port remains the conversation owner adapter.
- the native Host Runner owns the strict local preference store and provider conversation deletion.
- no business domain or Prisma adapter participates.

The existing 500-plus-line `AgentConversationSurface` must be decomposed into shared conversation flow, dock composition, and Agent OS history composition rather than expanded further.

## 14. Verification

### 14.1 Web behavior

- existing bottom-sidebar `AI 챗` utility opens the global dock while remaining independent of menu definitions
- collapsed-sidebar and authenticated full-screen launcher behavior
- dock state and active conversation survive ordinary route navigation
- Dashboard remains visible beside the dock at wide desktop sizes
- Dashboard Agent entry opens an Agent-bound draft in the same dock
- `전체 기록` opens Agent OS at the current conversation or context
- dock and Agent OS reuse one conversation flow without duplicate transcript state
- Dashboard return and KidItem visual tokens
- General plus exactly five Agent folders in stable order
- folder expansion, selection, nested sessions, and `updatedAt` ordering
- primary General draft and folder-specific Agent drafts
- no Conversation API call merely from opening or closing a draft
- first Send creates the conversation and fixes Provider
- combined selector supports Provider only before creation and model/effort between turns
- General/Agent plus Provider preference selection
- existing conversation last-selection precedence
- invalid stored selection requires explicit user action
- search, folder filter, rename, individual delete, folder delete, and delete all
- partial bulk-delete result behavior
- keyboard, focus return, IME-safe Enter, reduced motion, and responsive drawer
- Invocation, Operation, resource cards, live messages, and terminal history reconciliation regressions

### 14.2 Server and Host Runner behavior

- strict preference input/output schemas
- organization and current-user fence on preference and history APIs
- atomic preference-file writes and invalid-file rejection
- no secret, credential, transcript, provider reference, or execution binding in preferences
- create only on first Send
- immutable Provider and Agent binding after creation
- same existing delete ordering: Provider first, descriptor second
- bulk operation partial failure remains retryable

### 14.3 Browser QA

Run authenticated browser QA for:

1. open General chat from the bottom-sidebar utility on multiple authenticated routes;
2. keep the dock and active conversation while navigating between work screens;
3. open an Agent-bound draft from a Dashboard Agent entry;
4. open the same conversation through `전체 기록` and return to Dashboard;
5. immediate General chat start;
6. Agent-folder chat start;
7. model/reasoning override between turns;
8. settings save and reuse in a new draft;
9. rename, search, individual delete, and confirmed bulk delete against disposable QA conversations;
10. docked desktop, overlay drawer, Agent OS desktop, and Agent OS drawer layouts; and
11. console/network checks confirming one conversation transport, no retired Agent OS endpoints, and no internal-error toasts.

## 15. Schema and Deployment Impact

- Prisma schema: no change
- KidItem durable business data: no change
- Nginx/public ports: no change
- CopilotKit endpoint: no change
- public route and sidebar-menu schema: no required change
- Host Runner state: one versioned, bounded preference file
- Provider login state: no change
- Windows/macOS process lifecycle: no change

This is a focused global conversation-access, history-workspace UX, and Host Runner preference extension. It does not fix the final product sidebar composition and does not reopen KID-25 lifecycle, capability, approval, MCP, or database architecture.
