"""Distill all graphify-out/*/graph.json into a compact session-start summary.

Reads every `graphify-out/<domain>/graph.json` and emits a markdown summary
of god nodes, patterns, prohibits, rules, and key hyperedges. Intended for
injection via SessionStart hook as `additionalContext` — gives the agent
distilled knowledge-graph signal without loading full GRAPH_REPORT.md files.

Usage:
    python3 scripts/graphify-distill.py            # stdout markdown
    python3 scripts/graphify-distill.py --json     # stdout structured JSON
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


MAX_GOD_NODES = 3
MAX_PATTERNS = 15
MAX_PROHIBITS = 10
MAX_RULES = 10
MAX_HYPEREDGES = 3


def find_graphs(root: Path) -> list[Path]:
    """Return every graph.json under root/graphify-out/<domain>/, sorted."""
    out_dir = root / 'graphify-out'
    if not out_dir.is_dir():
        return []
    hits = []
    for path in out_dir.glob('**/graph.json'):
        # Skip temp dirs like .erd-corpus
        if any(part.startswith('.') for part in path.relative_to(out_dir).parts):
            continue
        hits.append(path)
    return sorted(hits)


def domain_slug(graph_path: Path, root: Path) -> str:
    """e.g. graphify-out/server/agent-registry/graph.json -> server/agent-registry"""
    rel = graph_path.relative_to(root / 'graphify-out')
    return str(rel.parent)


def compute_degrees(graph: dict) -> dict[str, int]:
    """Return {node_id: degree} from the graph."""
    degrees: dict[str, int] = {}
    # NetworkX json_graph saves edges under 'links' by default
    edges = graph.get('links', graph.get('edges', []))
    for e in edges:
        s = e.get('source')
        t = e.get('target')
        if s:
            degrees[s] = degrees.get(s, 0) + 1
        if t and t != s:
            degrees[t] = degrees.get(t, 0) + 1
    return degrees


def distill_graph(graph_path: Path, root: Path) -> dict:
    """Read a graph.json and return a structured distill dict."""
    graph = json.loads(graph_path.read_text())
    nodes = graph.get('nodes', [])
    edges = graph.get('links', graph.get('edges', []))
    hyperedges = graph.get('hyperedges', [])

    degrees = compute_degrees(graph)

    # God nodes: highest-degree nodes with code-ish labels (not prose-labeled)
    # Filter out label-only nodes like "Pattern:" or "Prohibit:" for the god list.
    PREFIXES = ('Pattern:', 'Prohibit:', 'Rule:', 'Rationale:', 'File:')
    god_candidates = [
        (n['id'], n.get('label', n['id']), degrees.get(n['id'], 0))
        for n in nodes
        if not any(n.get('label', '').startswith(p) for p in PREFIXES)
    ]
    god_candidates.sort(key=lambda x: -x[2])
    gods = [label for _, label, _ in god_candidates[:MAX_GOD_NODES] if _]

    def collect(prefix: str, limit: int) -> list[str]:
        labels = [
            n.get('label', '').removeprefix(prefix).strip()
            for n in nodes
            if n.get('label', '').startswith(prefix)
        ]
        return labels[:limit]

    patterns = collect('Pattern:', MAX_PATTERNS)
    prohibits = collect('Prohibit:', MAX_PROHIBITS)
    rules = collect('Rule:', MAX_RULES)

    # Top hyperedges by size
    sized = sorted(hyperedges, key=lambda h: -len(h.get('nodes', [])))
    he_labels = [h.get('label', '') for h in sized[:MAX_HYPEREDGES]]

    # Last modified = mtime of the graph.json file
    mtime = datetime.fromtimestamp(graph_path.stat().st_mtime, tz=timezone.utc)

    return {
        'slug': domain_slug(graph_path, root),
        'nodes': len(nodes),
        'edges': len(edges),
        'updated': mtime.strftime('%Y-%m-%d'),
        'god_nodes': gods,
        'patterns': patterns,
        'prohibits': prohibits,
        'rules': rules,
        'hyperedges': he_labels,
    }


def format_markdown(distilled: list[dict]) -> str:
    if not distilled:
        return '== Knowledge graphs ==\n(no graphs available — run /graphify on a domain first)\n'

    lines = ['== Knowledge graphs (auto-distilled from graphify-out/) ==', '']
    for d in distilled:
        lines.append(
            f"[{d['slug']}] {d['nodes']} nodes · {d['edges']} edges · updated {d['updated']}"
        )
        if d['god_nodes']:
            lines.append(f"  Canonical: {', '.join(d['god_nodes'])}")
        if d['patterns']:
            lines.append('  Patterns:')
            for p in d['patterns']:
                lines.append(f'    - {p}')
        if d['prohibits']:
            lines.append('  Prohibits (hard bans):')
            for p in d['prohibits']:
                lines.append(f'    - {p}')
        if d['rules']:
            lines.append('  Rules:')
            for r in d['rules']:
                lines.append(f'    - {r}')
        if d['hyperedges']:
            lines.append(f"  Key pipelines: {'; '.join(d['hyperedges'])}")
        lines.append('')

    lines.append('For file-specific rules: /graphify query "rules for <filepath>" (BFS 2-hop)')
    lines.append('If distilled info seems stale, rebuild: ./scripts/graphify-rebuild-domain.sh <path>')
    lines.append('Full reports live at graphify-out/<domain>/GRAPH_REPORT.md')
    return '\n'.join(lines) + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(description='Distill graphify outputs')
    parser.add_argument('--json', action='store_true', help='Emit structured JSON instead of markdown')
    parser.add_argument('--root', default=None, help='Project root (default: $CLAUDE_PROJECT_DIR or git top-level)')
    args = parser.parse_args()

    if args.root:
        root = Path(args.root).resolve()
    elif os.environ.get('CLAUDE_PROJECT_DIR'):
        root = Path(os.environ['CLAUDE_PROJECT_DIR']).resolve()
    else:
        # Walk up to find .git
        cur = Path.cwd().resolve()
        while cur != cur.parent and not (cur / '.git').exists():
            cur = cur.parent
        root = cur

    graphs = find_graphs(root)
    distilled = [distill_graph(g, root) for g in graphs]

    if args.json:
        print(json.dumps(distilled, indent=2))
    else:
        sys.stdout.write(format_markdown(distilled))
    return 0


if __name__ == '__main__':
    sys.exit(main())
