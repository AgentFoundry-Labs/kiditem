from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable
import os
import shutil

from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.build import build
from graphify.cluster import cluster, score_all
from graphify.export import to_html, to_json
from graphify.extract import collect_files, extract
from graphify.report import generate as generate_report

ROOT = Path(__file__).resolve().parents[1]
PRISMA_MODELS = ROOT / 'prisma' / 'models'
ADR_DIR = ROOT / '.claude' / 'docs' / 'decisions'

IMPORTANT_FIELD_NAMES = {
    'companyId', 'masterId', 'optionId', 'listingId', 'listingOptionId',
    'externalId', 'externalOptionId', 'vendorItemId', 'sellerProductId',
    'legacyCode', 'barcode', 'isDeleted', 'isActive', 'isUnmatched',
    'orderId', 'orderLineItemId', 'returnId', 'warehouseId', 'supplierId',
    'targetType', 'targetId', 'actionTaskId', 'agentDefinitionId',
}

IGNORE_DIR_PARTS = {'node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'graphify-out', '.omc', '.omx'}


def norm(value: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]+', '_', value).strip('_').lower()


def rel(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def camel(name: str) -> str:
    return name[:1].lower() + name[1:]


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8', errors='ignore')


class GraphBuilder:
    def __init__(self) -> None:
        self.nodes: dict[str, dict] = {}
        self.edges: dict[tuple[str, str, str, str], dict] = {}

    def node(self, node_id: str, label: str, file_type: str, source_file: str, **attrs) -> str:
        item = {
            'id': node_id,
            'label': label,
            'file_type': file_type,
            'source_file': source_file,
            **attrs,
        }
        old = self.nodes.get(node_id, {})
        old.update({k: v for k, v in item.items() if v is not None})
        self.nodes[node_id] = old
        return node_id

    def edge(self, source: str, target: str, relation: str, source_file: str, confidence: str = 'EXTRACTED', **attrs) -> None:
        if source == target:
            return
        key = (source, target, relation, source_file)
        item = {
            'source': source,
            'target': target,
            'relation': relation,
            'confidence': confidence,
            'source_file': source_file,
            'weight': attrs.pop('weight', 1.0),
            **attrs,
        }
        self.edges[key] = item

    def extraction(self) -> dict:
        return {
            'nodes': list(self.nodes.values()),
            'edges': list(self.edges.values()),
            'hyperedges': [],
            'input_tokens': 0,
            'output_tokens': 0,
        }


def collect_doc_comments(lines: list[str], model_index: int) -> list[str]:
    docs: list[str] = []
    i = model_index - 1
    while i >= 0:
        stripped = lines[i].strip()
        if not stripped:
            i -= 1
            continue
        if not stripped.startswith('///'):
            break
        docs.insert(0, stripped)
        i -= 1
    return docs


def collect_block(lines: list[str], start: int) -> list[str]:
    block: list[str] = []
    depth = 0
    for i in range(start, len(lines)):
        line = lines[i]
        block.append(line)
        depth += line.count('{') - line.count('}')
        if depth == 0:
            break
    return block


def doc_value(docs: list[str], tag: str) -> str:
    prefix = f'/// {tag}'
    for d in docs:
        if d.startswith(prefix):
            return d[len(prefix):].strip()
    return ''


def parse_field_list(value: str) -> list[str]:
    return [v.strip() for v in value.split(',') if v.strip()]


def strip_inline_comment(line: str) -> str:
    idx = line.find('//')
    return line if idx == -1 else line[:idx]


def parse_prisma_models() -> dict[str, dict]:
    models: dict[str, dict] = {}
    for file in sorted(PRISMA_MODELS.glob('*.prisma')):
        lines = read(file).splitlines()
        i = 0
        while i < len(lines):
            m = re.match(r'^model\s+(\w+)\s*\{', lines[i])
            if not m:
                i += 1
                continue
            name = m.group(1)
            docs = collect_doc_comments(lines, i)
            block = collect_block(lines, i)
            block_text = '\n'.join(block)
            table = re.search(r'@@map\("([^"]+)"\)', block_text)
            model = {
                'name': name,
                'file': rel(file),
                'namespace': doc_value(docs, '@namespace') or 'Uncategorized',
                'description': doc_value(docs, '@describe') or '',
                'table': table.group(1) if table else name,
                'fields': [],
                'relations': [],
                'uniques': [],
                'indexes': [],
            }
            for raw in block[1:-1]:
                line = strip_inline_comment(raw).strip()
                if not line:
                    continue
                unique = re.search(r'@@unique\(\s*\[([^\]]+)\]', line)
                if unique:
                    model['uniques'].append(parse_field_list(unique.group(1)))
                    continue
                index = re.search(r'@@index\(\s*\[([^\]]+)\]', line)
                if index:
                    model['indexes'].append(parse_field_list(index.group(1)))
                    continue
                if line.startswith('@@'):
                    continue
                parts = line.split()
                if len(parts) < 2:
                    continue
                fname, ftype = parts[0], parts[1]
                base_type = ftype.replace('?', '').replace('[]', '')
                relation_fields = []
                fm = re.search(r'fields:\s*\[([^\]]+)\]', line)
                if fm:
                    relation_fields = parse_field_list(fm.group(1))
                model['fields'].append({
                    'name': fname,
                    'type': ftype,
                    'base_type': base_type,
                    'is_id': '@id' in line,
                    'is_unique': '@unique' in line,
                    'is_relation': '@relation' in line,
                    'relation_fields': relation_fields,
                })
            models[name] = model
            i += len(block)
    return models


def add_schema_graph(builder: GraphBuilder, models: dict[str, dict]) -> None:
    for model in models.values():
        domain_id = f'domain_{norm(model["namespace"])}'
        model_id = f'model_{norm(model["name"])}'
        table_id = f'table_{norm(model["table"])}'
        builder.node(domain_id, model['namespace'], 'rationale', model['file'], node_type='domain')
        builder.node(model_id, model['name'], 'code', model['file'], node_type='prisma_model', namespace=model['namespace'], table=model['table'], description=model['description'])
        builder.node(table_id, model['table'], 'code', model['file'], node_type='db_table', model=model['name'])
        builder.edge(domain_id, model_id, 'contains_model', model['file'])
        builder.edge(model_id, table_id, 'maps_to_table', model['file'])

        for field in model['fields']:
            # Skip back-relation arrays as field nodes unless they are relation FKs with fields: [].
            if field['base_type'] in models and not field['relation_fields']:
                continue
            field_id = f'field_{norm(model["name"])}_{norm(field["name"])}'
            builder.node(field_id, f'{model["name"]}.{field["name"]}', 'code', model['file'], node_type='prisma_field', model=model['name'], field=field['name'], field_type=field['type'])
            builder.edge(model_id, field_id, 'has_field', model['file'])
            if field['is_id']:
                builder.edge(field_id, table_id, 'primary_key_on', model['file'])
            if field['is_unique']:
                builder.edge(field_id, model_id, 'unique_in_model', model['file'])

        for unique in model['uniques']:
            key_label = f'{model["name"]} unique({", ".join(unique)})'
            key_id = f'unique_{norm(model["name"])}_{norm("_".join(unique))}'
            builder.node(key_id, key_label, 'code', model['file'], node_type='unique_constraint', model=model['name'])
            builder.edge(model_id, key_id, 'has_unique_key', model['file'])
            for fname in unique:
                fid = f'field_{norm(model["name"])}_{norm(fname)}'
                if fid in builder.nodes:
                    builder.edge(key_id, fid, 'uses_field', model['file'])

    for model in models.values():
        source_model_id = f'model_{norm(model["name"])}'
        for field in model['fields']:
            if not field['relation_fields'] or field['base_type'] not in models:
                continue
            target_model_id = f'model_{norm(field["base_type"])}'
            builder.edge(source_model_id, target_model_id, f'relation:{field["name"]}', model['file'])
            for fname in field['relation_fields']:
                fid = f'field_{norm(model["name"])}_{norm(fname)}'
                if fid in builder.nodes:
                    builder.edge(fid, target_model_id, 'foreign_key_to', model['file'])

    # Explicit ontology aliases around the current channel option identity refactor.
    concept_vendor = builder.node('concept_vendor_item_id', 'vendorItemId provider term', 'rationale', 'apps/server/src/channels/CLAUDE.md', node_type='provider_term')
    concept_external = builder.node('concept_external_option_id', 'externalOptionId canonical option identity', 'rationale', 'prisma/models/core.prisma', node_type='canonical_concept')
    field_external = 'field_channellistingoption_externaloptionid'
    if field_external in builder.nodes:
        builder.edge(concept_external, field_external, 'implemented_by_field', 'prisma/models/core.prisma')
        builder.edge(concept_vendor, concept_external, 'mapped_to_canonical_name', 'apps/server/src/channels/CLAUDE.md', confidence='EXTRACTED')


def markdown_title(path: Path, text: str) -> str:
    fm = re.search(r'^title:\s*(.+)$', text, re.M)
    if fm:
        return fm.group(1).strip().strip('"')
    h = re.search(r'^#\s+(.+)$', text, re.M)
    return h.group(1).strip() if h else path.name


def add_document_mentions(builder: GraphBuilder, files: Iterable[Path], models: dict[str, dict]) -> None:
    for path in sorted(files):
        if not path.exists() or path.is_dir():
            continue
        text = read(path)
        source = rel(path)
        doc_id = f'doc_{norm(source)}'
        builder.node(doc_id, markdown_title(path, text), 'document', source, node_type='document')
        for model in models.values():
            model_id = f'model_{norm(model["name"])}'
            if re.search(rf'\b{re.escape(model["name"])}\b', text) or model['table'] in text:
                builder.edge(doc_id, model_id, 'mentions_model', source, confidence='EXTRACTED')
            if model['namespace'].lower() in text.lower():
                builder.edge(doc_id, f'domain_{norm(model["namespace"])}', 'mentions_domain', source, confidence='EXTRACTED')
            for field in model['fields']:
                fname = field['name']
                if fname in IMPORTANT_FIELD_NAMES and re.search(rf'\b{re.escape(fname)}\b', text):
                    fid = f'field_{norm(model["name"])}_{norm(fname)}'
                    if fid in builder.nodes:
                        builder.edge(doc_id, fid, 'mentions_field', source, confidence='EXTRACTED')


def is_supported_code(path: Path) -> bool:
    return path.suffix.lower() in {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.sh'}


def collect_code(paths: Iterable[Path]) -> list[Path]:
    result: list[Path] = []
    for p in paths:
        if not p.exists():
            continue
        if p.is_file():
            if is_supported_code(p):
                result.append(p)
            continue
        for child in p.rglob('*'):
            if child.is_file() and is_supported_code(child) and not (set(child.parts) & IGNORE_DIR_PARTS):
                result.append(child)
    return sorted(set(result))


def add_code_reference_edges(builder: GraphBuilder, code_files: Iterable[Path], models: dict[str, dict]) -> None:
    for path in code_files:
        text = read(path)
        source = rel(path)
        file_id = norm(source)
        if file_id not in builder.nodes:
            builder.node(file_id, path.name, 'code', source, node_type='code_file')
        lower = text.lower()
        for model in models.values():
            model_id = f'model_{norm(model["name"])}'
            tokens = {model['name'], camel(model['name']), model['table']}
            model_hit = any(token and token in text for token in tokens) or model['table'].lower() in lower
            field_hit_names: list[str] = []
            for field in model['fields']:
                fname = field['name']
                if fname in IMPORTANT_FIELD_NAMES and re.search(rf'\b{re.escape(fname)}\b', text):
                    field_hit_names.append(fname)
            if model_hit:
                builder.edge(file_id, model_id, 'references_model', source, confidence='INFERRED', confidence_score=0.78)
            if model_hit or field_hit_names:
                for fname in field_hit_names:
                    fid = f'field_{norm(model["name"])}_{norm(fname)}'
                    if fid in builder.nodes:
                        builder.edge(file_id, fid, 'references_field', source, confidence='INFERRED', confidence_score=0.72)
        if 'vendorItemId' in text:
            builder.edge(file_id, 'concept_vendor_item_id', 'uses_provider_term', source, confidence='EXTRACTED')
        if 'externalOptionId' in text:
            builder.edge(file_id, 'concept_external_option_id', 'uses_canonical_option_identity', source, confidence='EXTRACTED')


def merge_extractions(primary: dict, extras: list[dict]) -> dict:
    nodes = {n['id']: n for n in primary.get('nodes', [])}
    edges = {(e.get('source'), e.get('target'), e.get('relation'), e.get('source_file')): e for e in primary.get('edges', [])}
    hyperedges = list(primary.get('hyperedges', []))
    for ext in extras:
        for n in ext.get('nodes', []):
            nodes[n['id']] = {**nodes.get(n['id'], {}), **n}
        for e in ext.get('edges', []):
            edges[(e.get('source'), e.get('target'), e.get('relation'), e.get('source_file'))] = e
        hyperedges.extend(ext.get('hyperedges', []))
    return {'nodes': list(nodes.values()), 'edges': list(edges.values()), 'hyperedges': hyperedges, 'input_tokens': 0, 'output_tokens': 0}


def community_labels(G, communities: dict[int, list[str]]) -> dict[int, str]:
    labels: dict[int, str] = {}
    for cid, nodes in communities.items():
        domains = [G.nodes[n].get('namespace') for n in nodes if G.nodes[n].get('namespace')]
        types = [G.nodes[n].get('node_type') for n in nodes if G.nodes[n].get('node_type')]
        if domains:
            d = Counter(domains).most_common(1)[0][0]
            labels[cid] = f'{d} schema'
            continue
        if types:
            t = Counter(types).most_common(1)[0][0].replace('_', ' ')
            sample = next((G.nodes[n].get('label', n) for n in nodes if G.nodes[n].get('node_type') == types[0]), None)
            labels[cid] = f'{t}: {sample}' if sample else t
            continue
        labels[cid] = f'Community {cid}'
    return labels


def write_outputs(name: str, extraction: dict, source_paths: list[Path]) -> dict:
    out = ROOT / 'graphify-out' / name
    out.mkdir(parents=True, exist_ok=True)
    G = build([extraction], directed=False)
    communities = cluster(G)
    scores = score_all(G, communities)
    labels = community_labels(G, communities)
    gods = god_nodes(G, top_n=12)
    surprises = surprising_connections(G, communities, top_n=8)
    questions = suggest_questions(G, communities, labels, top_n=7)
    detection = {
        'total_files': len(source_paths),
        'total_words': sum(len(read(p).split()) for p in source_paths if p.exists() and p.is_file()),
    }
    report = generate_report(
        G,
        communities,
        scores,
        labels,
        gods,
        surprises,
        detection,
        {'input': 0, 'output': 0},
        name,
        questions,
    )
    (out / 'GRAPH_REPORT.md').write_text(report, encoding='utf-8')
    to_json(G, communities, str(out / 'graph.json'), force=True)
    to_html(G, communities, str(out / 'graph.html'), community_labels=labels)
    (out / 'README.md').write_text(
        f'# {name}\n\nGenerated KidItem Graphify-compatible graph. Open `graph.html`, read `GRAPH_REPORT.md`, or query `graph.json`.\n',
        encoding='utf-8',
    )
    return {'out': rel(out), 'nodes': G.number_of_nodes(), 'edges': G.number_of_edges(), 'communities': len(communities), 'files': len(source_paths)}


def make_schema_graph(models: dict[str, dict]) -> tuple[dict, list[Path]]:
    b = GraphBuilder()
    add_schema_graph(b, models)
    docs = [ROOT / 'docs' / 'ERD.md', ROOT / 'prisma' / 'AGENTS.md'] + sorted(ADR_DIR.glob('*.md'))
    add_document_mentions(b, docs, models)
    return b.extraction(), docs + sorted(PRISMA_MODELS.glob('*.prisma'))


def make_schema_consumers_graph(models: dict[str, dict]) -> tuple[dict, list[Path]]:
    schema_ext, schema_sources = make_schema_graph(models)
    b = GraphBuilder()
    # Import schema extraction into builder for easy edge additions.
    for n in schema_ext['nodes']:
        b.nodes[n['id']] = n
    for e in schema_ext['edges']:
        b.edges[(e['source'], e['target'], e['relation'], e['source_file'])] = e

    consumer_roots = [ROOT / 'apps/server/src/channels', ROOT / 'packages/shared', ROOT / 'scripts']
    code_files = collect_code(consumer_roots)
    ast_files = [Path(rel(path)) for path in code_files]
    ast = extract(ast_files) if ast_files else {'nodes': [], 'edges': [], 'input_tokens': 0, 'output_tokens': 0}
    add_code_reference_edges(b, code_files, models)
    combined = merge_extractions(b.extraction(), [ast])
    docs = []
    for p in [ROOT / 'packages/shared/AGENTS.md', ROOT / 'apps/server/src/channels/CLAUDE.md']:
        if p.exists():
            docs.append(p)
    add_document_mentions(b, docs, models)
    combined = merge_extractions(b.extraction(), [ast])
    return combined, schema_sources + code_files + docs


def main() -> None:
    os.chdir(ROOT)
    shutil.rmtree(ROOT / 'graphify-out' / 'cache', ignore_errors=True)
    models = parse_prisma_models()
    schema_ext, schema_sources = make_schema_graph(models)
    schema_summary = write_outputs('schema', schema_ext, schema_sources)
    consumers_ext, consumers_sources = make_schema_consumers_graph(models)
    consumers_summary = write_outputs('schema-consumers', consumers_ext, consumers_sources)
    print(json.dumps({'schema': schema_summary, 'schema_consumers': consumers_summary}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
