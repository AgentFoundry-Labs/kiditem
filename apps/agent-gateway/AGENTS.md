# Native Agent Runner

This package owns the host-native Codex/Claude process boundary for KID-25.

- Accept only the protected, one-argument Runner config; never add a listener.
- Treat Nest input as typed launch data, never as executable paths, shell
  arguments, working directories, or environment overrides.
- Keep Attempt tokens, provider credentials, prompts, raw provider payloads,
  and stderr out of logs, durable storage, and model-visible environments.
- Attempts and their workspaces are ephemeral. Provider login references are
  validated without reading or copying credential bytes.
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
