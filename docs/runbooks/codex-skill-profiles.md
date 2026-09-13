# Skill Installation And Troubleshooting

## Purpose

Shared development skills and KidItem-owned skills have separate owners, and
both harnesses read the same sources:

```text
agent-skill-hub marketplace -> Development plugin -> .agents/skills, .claude/skills
KidItem skills/             -> update command     -> .agents/skills, .claude/skills
```

`.agents/skills` is Codex discovery and `.claude/skills` is Claude Code
discovery. Both are gitignored and hold only symlinks. Each owner reconciles
its own links and leaves the other owner's entries untouched.

KidItem never clones external skill repositories or exports shared profiles.
The Development plugin follows the latest configured upstream revisions and
keeps its repositories under plugin-managed data.

## Set Up Another Computer

Install the shared Development profile from the private Git marketplace.

Codex:

```bash
rtk codex plugin marketplace add yhc125/agent-skill-hub --ref main
rtk codex plugin add development@agent-skill-hub
```

Claude Code:

```bash
rtk claude plugin marketplace add yhc125/agent-skill-hub
rtk claude plugin install development@agent-skill-hub
```

The GitHub account used by Git must be able to read the repository. No manual
clone of `agent-skill-hub` or an included upstream source is required.

The plugin's SessionStart hook refreshes upstream revisions during normal use
and syncs both discovery directories. A git worktree inherits the main
checkout's opt-in, so a fresh worktree exposes the same skills without extra
setup. Plugin cache and plugin-data directories are managed runtime state, not
duplicate workspace clones; do not remove them manually.

## Repository-Owned Skills

Sources under `skills/` are tracked with the repository. The update command
manages their links in both discovery directories and preserves plugin-owned
entries.

## Update And Verify

Apply the fixed project-local set to both discovery directories:

```bash
rtk npm run skills:update
```

Verify without changing links:

```bash
rtk npm run skills:verify
```

Both commands verify that every KidItem-owned link resolves to `SKILL.md`. The
Codex prompt-scope probe runs only when the Codex CLI starts; it reports a
warning rather than failing when the CLI is unavailable or misconfigured.
Start a fresh agent session after changing links so injected skill metadata is
reloaded.

## Troubleshooting

Keep `.agents/` limited to `skills/`. Source checkouts, generated catalogs,
temporary schemas, and tool output belong to their respective owners.

Inspect the affected path or plugin diagnostic when verification reports:

- a KidItem-owned source lacks `SKILL.md`;
- a real file or directory occupies a managed discovery name;
- a link this command owns points somewhere unexpected; or
- the Development plugin reports an unhealthy managed runtime.
