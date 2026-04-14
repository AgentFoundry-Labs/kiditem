#!/usr/bin/env bash
# Post-process a graphify build + rebuild graph/HTML/report with cleaned data.
#
# Prerequisite: user ran `/graphify <TARGET> --wiki` from Claude Code already,
#   so <TARGET>/graphify-out/.graphify_extract.json exists.
#
# Usage:
#   ./scripts/graphify-rebuild-domain.sh apps/server/src/agent-registry [--include-tests]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:?target domain path required (e.g. apps/server/src/agent-registry)}"
shift || true
EXTRA_FLAGS="$*"

# Slug mapping:
#   apps/server/src/X -> server/X
#   apps/web/src/X    -> web/X
#   apps/web          -> web
#   apps/server       -> server
#   packages/X        -> X
SLUG=$(echo "$TARGET" | sed -E 's|^apps/server/src/|server/|; s|^apps/web/src/|web/|; s|^apps/web$|web|; s|^apps/server$|server|; s|^packages/||')
OUT="$ROOT/graphify-out/$SLUG"
GDIR="$ROOT/$TARGET/graphify-out"
EXTRACT="$GDIR/.graphify_extract.json"

# Precondition — fail loud
if [ ! -f "$EXTRACT" ]; then
    echo "ERROR: $EXTRACT not found." >&2
    echo "Run this in Claude Code first:" >&2
    echo "    /graphify $TARGET --wiki" >&2
    exit 1
fi

# Resolve the graphify Python interpreter (graphify is usually pipx-installed,
# not in system python3)
if [ -f "$GDIR/.graphify_python" ]; then
    GRAPHIFY_PYTHON=$(cat "$GDIR/.graphify_python")
elif command -v graphify >/dev/null 2>&1; then
    GRAPHIFY_PYTHON=$(head -1 "$(command -v graphify)" | tr -d '#!')
else
    GRAPHIFY_PYTHON=python3
fi
if ! "$GRAPHIFY_PYTHON" -c 'import graphify' 2>/dev/null; then
    echo "ERROR: graphify package not importable via $GRAPHIFY_PYTHON" >&2
    echo "Try: pipx install graphifyy" >&2
    exit 1
fi

echo "[rebuild] target=$TARGET slug=$SLUG python=$GRAPHIFY_PYTHON"

# Step 0: Cache purge (avoid stale extracts on re-run)
rm -rf "$GDIR/cache"

# Step 1: Post-process (idempotent via sentinel)
python3 "$ROOT/scripts/graphify-postprocess.py" "$EXTRACT" $EXTRA_FLAGS

# Step 2: Rebuild graph/cluster/report/HTML from processed extract
#   The /graphify skill already wrote graph.json, graph.html, GRAPH_REPORT.md
#   from the unprocessed extract. Remove them so the rebuild fails loud if
#   anything goes wrong.
rm -f "$GDIR/graph.json" "$GDIR/graph.html" "$GDIR/GRAPH_REPORT.md"

"$GRAPHIFY_PYTHON" - "$ROOT" "$TARGET" <<'PY'
import json, sys
from pathlib import Path

root, target = sys.argv[1], sys.argv[2]
gdir = Path(root) / target / 'graphify-out'

from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json, to_html

extraction = json.loads((gdir / '.graphify_extract.json').read_text())
detect_path = gdir / '.graphify_detect.json'
detection = (
    json.loads(detect_path.read_text())
    if detect_path.exists()
    else {'total_files': 0, 'total_words': 0, 'files': {}}
)

G = build_from_json(extraction)
communities = cluster(G)
cohesion = score_all(G, communities)
gods = god_nodes(G)
surprises = surprising_connections(G, communities)
labels = {cid: f'Cluster {cid} ({len(v)}n)' for cid, v in communities.items()}
questions = suggest_questions(G, communities, labels)

report = generate(
    G, communities, cohesion, labels,
    gods, surprises, detection,
    {'input': 0, 'output': 0},
    target,
    suggested_questions=questions,
)
(gdir / 'GRAPH_REPORT.md').write_text(report)
to_json(G, communities, str(gdir / 'graph.json'))
to_html(G, communities, str(gdir / 'graph.html'), community_labels=labels)

print(f'[rebuild] graph={G.number_of_nodes()} nodes, '
      f'{G.number_of_edges()} edges, {len(communities)} communities')
PY

# Step 3: Move final artifacts to graphify-out/<slug>/
mkdir -p "$OUT"
mv "$GDIR/GRAPH_REPORT.md" "$GDIR/graph.html" "$GDIR/graph.json" "$OUT/"
echo "[rebuild] Output: $OUT/"
