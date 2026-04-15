"""Post-process a Graphify extract.json for code-tree graphs.

Three transformations:

1. Test noise removal (default on): drops nodes from `__tests__/` dirs and
   `.spec.ts` / `.test.ts[x]` files, and any edges touching them.
   Use --include-tests to keep them.

2. File node unification: merges CLAUDE.md-side "File: X" reference nodes
   (source_file='CLAUDE.md', label starts with 'File: ') into the AST-side
   canonical file node (matched by source_file path). Redirects all edges
   pointing to the merged node.

3. Self-loop + duplicate edge removal: drops source==target edges after
   redirect; dedupes on (source, target, relation) triples while preserving
   multi-relation edges between the same pair.

Idempotent via `_post_processed_version` sentinel in the output JSON.

Usage:
    python3 scripts/graphify-postprocess.py <extract.json> [--include-tests]
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path


TEST_DIR_RE = re.compile(r'(^|/)__tests__/')
TEST_SUFFIXES = ('.spec.ts', '.spec.tsx', '.test.ts', '.test.tsx')

SENTINEL_KEY = '_post_processed_version'
SENTINEL_VALUE = 1


def is_test_file(source_file: str) -> bool:
    if not source_file:
        return False
    if TEST_DIR_RE.search(source_file):
        return True
    return source_file.endswith(TEST_SUFFIXES)


def _conf_rank(c: str | None) -> int:
    return {'EXTRACTED': 3, 'INFERRED': 2, 'AMBIGUOUS': 1}.get(c or '', 0)


def post_process(extract: dict, include_tests: bool = False) -> dict:
    """Return a cleaned copy of `extract`. Safe to call on already-processed input."""
    if extract.get(SENTINEL_KEY) == SENTINEL_VALUE:
        print('[postprocess] Already processed, returning as-is')
        return extract

    nodes = list(extract.get('nodes', []))
    edges = list(extract.get('edges', []))
    hyperedges = list(extract.get('hyperedges', []))

    # --- 1. Test filtering ---
    test_ids: set[str] = set()
    if not include_tests:
        test_ids = {n['id'] for n in nodes if is_test_file(n.get('source_file', ''))}
        nodes = [n for n in nodes if n['id'] not in test_ids]
        edges = [e for e in edges
                 if e.get('source') not in test_ids and e.get('target') not in test_ids]
        pruned_hyperedges = []
        for he in hyperedges:
            kept = [m for m in he.get('nodes', []) if m not in test_ids]
            if len(kept) >= 2:
                pruned_hyperedges.append({**he, 'nodes': kept})
        hyperedges = pruned_hyperedges

    # --- 2. File node unification ---
    # 2a. Build canonical_by_path: for each source_file, pick the AST file-level node.
    #     Heuristic: highest count as source of `contains` edges wins.
    contains_out: Counter[str] = Counter()
    for e in edges:
        if e.get('relation') == 'contains':
            contains_out[e.get('source', '')] += 1

    by_path: dict[str, list[dict]] = defaultdict(list)
    for n in nodes:
        sf = n.get('source_file', '')
        if not sf or sf == 'CLAUDE.md':
            continue
        if n.get('file_type') != 'code':
            continue
        if n['id'].startswith('claude_file_'):
            continue
        by_path[sf].append(n)

    canonical_by_path: dict[str, str] = {}
    for sf, group in by_path.items():
        # Prefer node with most `contains` outgoing edges; break ties by shorter label
        # (file-level node usually has label like "foo.ts", not a symbol like "foo.method()").
        group.sort(
            key=lambda n: (-contains_out.get(n['id'], 0), len(n.get('label', ''))),
        )
        canonical_by_path[sf] = group[0]['id']

    # 2b. Detect CLAUDE.md file-ref nodes and merge
    merge_map: dict[str, str] = {}
    orphan_refs: list[tuple[str, str]] = []
    dropped_ids: set[str] = set()
    for n in nodes:
        label = n.get('label', '')
        if n.get('source_file') == 'CLAUDE.md' and label.startswith('File: '):
            path = label.removeprefix('File: ').strip()
            if path in canonical_by_path:
                merge_map[n['id']] = canonical_by_path[path]
                dropped_ids.add(n['id'])
            else:
                orphan_refs.append((n['id'], path))
    nodes = [n for n in nodes if n['id'] not in dropped_ids]

    # --- 3. Edge redirect + self-loop drop + dedupe ---
    def remap(nid: str) -> str:
        return merge_map.get(nid, nid)

    dedupe: dict[tuple, dict] = {}
    for e in edges:
        s = remap(e.get('source', ''))
        t = remap(e.get('target', ''))
        if not s or not t:
            continue
        if s == t:
            continue  # self-loop after merge
        key = (s, t, e.get('relation'))
        redirected = {**e, 'source': s, 'target': t}
        existing = dedupe.get(key)
        if existing is None:
            dedupe[key] = redirected
        else:
            # Keep the one with higher confidence
            if _conf_rank(redirected.get('confidence')) > _conf_rank(existing.get('confidence')):
                dedupe[key] = redirected
    edges = list(dedupe.values())

    # 4. Hyperedge member redirect (preserve unique set)
    for he in hyperedges:
        he['nodes'] = sorted({remap(m) for m in he.get('nodes', [])})

    # 5. Build output + sentinel + stats
    result = {
        **extract,
        'nodes': nodes,
        'edges': edges,
        'hyperedges': hyperedges,
        SENTINEL_KEY: SENTINEL_VALUE,
        '_post_process_stats': {
            'tests_removed': len(test_ids),
            'file_merges': len(merge_map),
            'orphan_refs': len(orphan_refs),
            'nodes_after': len(nodes),
            'edges_after': len(edges),
            'hyperedges_after': len(hyperedges),
        },
    }

    # Log summary
    print(f'[postprocess] tests_removed={len(test_ids)} '
          f'file_merges={len(merge_map)} orphan_refs={len(orphan_refs)}')
    print(f'[postprocess] nodes={len(nodes)} edges={len(edges)} hyperedges={len(hyperedges)}')
    if orphan_refs:
        print(f'[postprocess] orphan CLAUDE.md file refs (no AST match):')
        for nid, path in orphan_refs[:10]:
            print(f'  - {path}  ({nid})')

    return result


def main() -> int:
    parser = argparse.ArgumentParser(description='Post-process Graphify extract.json')
    parser.add_argument('extract_path', help='Path to .graphify_extract.json')
    parser.add_argument('--include-tests', action='store_true',
                        help='Keep __tests__/ and *.spec.ts/*.test.ts nodes')
    args = parser.parse_args()

    path = Path(args.extract_path)
    if not path.exists():
        print(f'error: {path} not found', file=sys.stderr)
        return 1

    extract = json.loads(path.read_text())
    result = post_process(extract, include_tests=args.include_tests)
    path.write_text(json.dumps(result, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
