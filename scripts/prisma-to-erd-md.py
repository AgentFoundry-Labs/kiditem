"""Convert prisma/schema.prisma → graph-friendly markdown.

Output: one file with model list, relations graph, and per-model detail sections.
Used by scripts/graphify-erd.sh to feed Graphify's semantic extractor.

Usage:
    python3 scripts/prisma-to-erd-md.py prisma/schema.prisma > out.md
"""
import re
import sys


SCALAR_TYPES = {
    'Int', 'String', 'Boolean', 'Float', 'DateTime',
    'Json', 'BigInt', 'Decimal', 'Bytes',
}


def parse_schema(text: str):
    models = []
    model_pattern = re.compile(r'model\s+(\w+)\s*\{([^}]+)\}', re.DOTALL)
    for m in model_pattern.finditer(text):
        name = m.group(1)
        body = m.group(2)
        fields, relations = [], []
        for raw in body.splitlines():
            line = raw.strip()
            if not line or line.startswith('//') or line.startswith('@@'):
                continue
            parts = line.split(None, 1)
            if len(parts) < 2:
                continue
            fname, rest = parts[0], parts[1]
            if fname.startswith('@@') or fname.startswith('//'):
                continue
            type_match = re.match(r'([A-Za-z_][A-Za-z0-9_]*)(\[\])?', rest)
            if not type_match:
                continue
            ftype = type_match.group(1)
            is_array = bool(type_match.group(2))
            if ftype in SCALAR_TYPES:
                fields.append((fname, rest.split()[0]))
            else:
                rel_match = re.search(r'@relation\([^)]*\)', rest)
                relations.append({
                    'field': fname,
                    'target': ftype,
                    'cardinality': 'many' if is_array else 'one',
                    'detail': rel_match.group(0) if rel_match else '',
                    'optional': '?' in rest.split('@')[0],
                })
        models.append({'name': name, 'fields': fields, 'relations': relations})
    return models


def to_markdown(models):
    out = ['# Prisma Schema — Models and Relations\n']
    out.append(f'Total: **{len(models)} models**\n')

    out.append('## All Models\n')
    for m in models:
        out.append(f'- `{m["name"]}`')
    out.append('')

    out.append('## Relations Graph\n')
    for m in models:
        if not m['relations']:
            continue
        out.append(f'### {m["name"]}\n')
        for r in m['relations']:
            opt = '?' if r['optional'] else ''
            out.append(
                f'- **{m["name"]}** --[{r["field"]}{opt}]--> '
                f'**{r["target"]}** ({r["cardinality"]}) {r["detail"]}'
            )
        out.append('')

    out.append('## Model Details\n')
    for m in models:
        out.append(f'### {m["name"]}\n')
        if m['fields']:
            out.append('**Scalar fields**:')
            for f, t in m['fields']:
                out.append(f'- `{f}`: {t}')
            out.append('')
        if m['relations']:
            out.append('**Relations**:')
            for r in m['relations']:
                opt = '?' if r['optional'] else ''
                out.append(f'- `{r["field"]}{opt}` → {r["target"]} ({r["cardinality"]})')
            out.append('')
    return '\n'.join(out)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('usage: prisma-to-erd-md.py path/to/schema.prisma')
    text = open(sys.argv[1]).read()
    print(to_markdown(parse_schema(text)))
