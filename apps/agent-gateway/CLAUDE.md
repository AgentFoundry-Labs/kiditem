Before working in this directory, always read this document first rather than relying on memory.

# Native Agent Runner

This package owns the host-native Codex/Claude process boundary.

- Accept only the protected, one-argument Runner config; never add a listener.
- Treat Nest input as typed launch data, never as executable paths, shell
  arguments, working directories, or environment overrides.
- Keep the installation bearer, process-scoped MCP transport token, provider
  credentials, prompts, raw provider payloads, and stderr out of logs, durable
  storage, and model-visible environments. Provider login references are
  validated without reading or copying credential bytes.
- One long-running Gateway process owns provider-local Conversations and their
  turns. It generates one opaque MCP transport token per process and keeps the
  provider MCP configuration stable across ordinary turns. A turn ending must
  not close its Conversation, rotate that token, or restart the Gateway.
- Treat `conversationId` as a routing locator only. Nest owns the active-turn
  authority and permits at most one active turn per Conversation; the Gateway
  must report the exact provider terminal event before that authority is
  released. Interrupt acknowledgement alone is not terminal.
- Run Codex and Claude non-interactively in the bundled train's trusted
  full-access mode: Codex uses `approvalPolicy: never` with
  `:danger-full-access`; Claude uses `bypassPermissions`. Do not reintroduce a
  workspace-only profile, prompted permission mode, or MCP-only built-in-tool
  allowlist.
- This is not hostile-process containment. The dedicated non-administrator
  account may run full-access provider children, so it must contain only the
  provider login and Runner control material—not DB, Nest, business-provider,
  or unrelated credentials. The Runner bearer still protects LAN, other-user,
  and accidental callers.
- macOS and Windows supervisors must terminate complete process trees.
- Keep `platform` values exactly `macos` and `windows`.

## Verification

Run the package unit tests, build, pack dry-run, and the real macOS fixture
process test before declaring changes complete.
