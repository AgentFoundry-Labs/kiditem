# Native Agent Runner

This package owns the host-native Codex/Claude process boundary for KID-25.

- Accept only the protected, one-argument Runner config; never add a listener.
- Treat Nest input as typed launch data, never as executable paths, shell
  arguments, working directories, or environment overrides.
- Keep Attempt tokens, provider credentials, prompts, raw provider payloads,
  and stderr out of logs, durable storage, and model-visible environments.
- Attempts and their workspaces are ephemeral. Provider login references are
  validated without reading or copying credential bytes.
- macOS and Windows supervisors must terminate complete process trees.
- Keep `platform` values exactly `macos` and `windows`.

## Verification

Run the package unit tests, build, pack dry-run, and the real macOS fixture
process test before declaring changes complete.
