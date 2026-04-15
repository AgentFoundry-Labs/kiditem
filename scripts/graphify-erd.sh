#!/usr/bin/env bash
# Build a Graphify knowledge graph of the Prisma ERD.
# Output: graphify-out/erd/ (gitignored)
#
# Prereq: graphify CLI installed (`pip install graphifyy`)
# Regenerate whenever prisma/schema.prisma changes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CORPUS="$ROOT/graphify-out/.erd-corpus"
OUT="$ROOT/graphify-out/erd"

rm -rf "$CORPUS"
mkdir -p "$CORPUS" "$OUT"

python3 "$ROOT/scripts/prisma-to-erd-md.py" "$ROOT/prisma/schema.prisma" \
  > "$CORPUS/schema-models.md"

cp "$ROOT/.claude/docs/erd.md"          "$CORPUS/erd.md"
cp "$ROOT/.claude/docs/architecture.md" "$CORPUS/architecture.md"
cp "$ROOT/prisma/CLAUDE.md"             "$CORPUS/prisma-CLAUDE.md"

echo "Corpus built at $CORPUS ($(ls "$CORPUS" | wc -l | tr -d ' ') files)"
echo ""
echo "Next: run /graphify $CORPUS from Claude Code, then move outputs:"
echo "  mv graphify-out/*.html graphify-out/*.json graphify-out/*.md $OUT/"
echo ""
echo "Or if you have graphify CLI wired up directly, just point it at $CORPUS."
