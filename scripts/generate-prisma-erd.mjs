#!/usr/bin/env node
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_MODELS_DIR = path.join(REPO_ROOT, 'prisma', 'models');
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, 'docs', 'ERD.md');
const DEFAULT_DOMAIN_OUTPUT_DIR = path.join(REPO_ROOT, 'docs', 'erd');

export async function readPrismaModelFiles(modelsDir = DEFAULT_MODELS_DIR) {
  const entries = await readdir(modelsDir, { withFileTypes: true });
  const prismaFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.prisma'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(
    prismaFiles.map(async (fileName) => ({
      fileName,
      content: await readFile(path.join(modelsDir, fileName), 'utf8'),
    })),
  );
}

export function parsePrismaSchemaFiles(files) {
  const modelBlocks = [];

  for (const file of files) {
    const lines = file.content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(/^model\s+(\w+)\s*\{/);
      if (!match) continue;

      const docs = collectDocComments(lines, index);
      const block = collectModelBlock(lines, index);

      modelBlocks.push({
        fileName: file.fileName,
        startLine: index + 1,
        name: match[1],
        docs,
        block,
      });

      index += block.length - 1;
    }
  }

  const modelNames = new Set(modelBlocks.map((model) => model.name));
  const models = modelBlocks.map((model) => parseModelBlock(model, modelNames));
  const relations = models
    .flatMap((model) => model.relations)
    .sort((a, b) =>
      [a.fromModel, a.toModel, a.relationName].join(':').localeCompare(
        [b.fromModel, b.toModel, b.relationName].join(':'),
      ),
    );

  return {
    models: models.map(({ relations: _relations, uniqueSignatures: _uniqueSignatures, ...model }) => model),
    relations,
  };
}

export function generateMermaidErDiagram(schema) {
  const lines = ['erDiagram'];
  const models = [...schema.models].sort((a, b) => a.name.localeCompare(b.name));

  for (const model of models) {
    lines.push(`  ${model.name} {`);

    for (const field of model.fields) {
      const keyParts = [];
      if (field.isPrimaryKey) keyParts.push('PK');
      if (field.isForeignKey) keyParts.push('FK');
      if (field.isUnique) keyParts.push('UK');

      const keySuffix = keyParts.length > 0 ? ` ${keyParts.join(',')}` : '';
      lines.push(`    ${field.type} ${field.name}${keySuffix}`);
    }

    lines.push('  }');
  }

  for (const relation of schema.relations) {
    lines.push(
      `  ${relation.fromModel} ${relation.leftCardinality}--${relation.rightCardinality} ${relation.toModel} : "${relation.relationName}"`,
    );
  }

  return `${lines.join('\n')}\n`;
}

export function getDomainErdEntries(schema) {
  const domainCounts = new Map();

  for (const model of schema.models) {
    domainCounts.set(model.namespace, (domainCounts.get(model.namespace) ?? 0) + 1);
  }

  return [...domainCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([domain, modelCount]) => ({
      domain,
      modelCount,
      fileName: `${slugifyDomain(domain)}.md`,
    }));
}

export function generateErdMarkdown(schema, options = {}) {
  const sourceFiles = [...(options.sourceFiles ?? [])].sort((a, b) => a.localeCompare(b));
  const domainErds = options.domainErds ?? getDomainErdEntries(schema);
  const models = [...schema.models].sort((a, b) =>
    [a.namespace, a.name].join(':').localeCompare([b.namespace, b.name].join(':')),
  );
  const mermaid = generateMermaidErDiagram(schema);

  return [
    '# Database ERD',
    '',
    '> Generated from `prisma/models/*.prisma`. Do not edit the diagram by hand.',
    '> Regenerate this file with `npm run db:erd` after Prisma schema changes.',
    '> When committing schema navigation artifacts, run `npm run graphify:schema` as well.',
    '',
    'This ERD is a development-time navigation aid. The source of truth is still the Prisma schema under `prisma/`, plus PostgreSQL-only constraints in `prisma/3layer-setup.sql`.',
    '',
    '## Sources',
    '',
    ...sourceFiles.map((fileName) => `- \`prisma/models/${fileName}\``),
    '',
    '## Domain ERDs',
    '',
    '| Domain | Models |',
    '|---|---:|',
    ...domainErds.map(
      (entry) => `| [${entry.domain}](erd/${entry.fileName}) | ${entry.modelCount} |`,
    ),
    '',
    '## Model Index',
    '',
    '| Model | Domain | Table | Description |',
    '|---|---:|---|---|',
    ...models.map(
      (model) =>
        `| ${model.name} | ${model.namespace} | \`${model.tableName}\` | ${escapeMarkdownTableCell(
          model.description || '-',
        )} |`,
    ),
    '',
    '## Mermaid ER Diagram',
    '',
    '```mermaid',
    mermaid.trimEnd(),
    '```',
    '',
  ].join('\n');
}

export function generateDomainErdMarkdown(schema, domain) {
  const modelByName = new Map(schema.models.map((model) => [model.name, model]));
  const models = schema.models
    .filter((model) => model.namespace === domain)
    .sort((a, b) => a.name.localeCompare(b.name));
  const localModelNames = new Set(models.map((model) => model.name));
  const localRelations = schema.relations.filter(
    (relation) => localModelNames.has(relation.fromModel) && localModelNames.has(relation.toModel),
  );
  const externalReferences = schema.relations
    .filter((relation) => localModelNames.has(relation.fromModel) !== localModelNames.has(relation.toModel))
    .map((relation) => {
      const localModel = localModelNames.has(relation.fromModel) ? relation.fromModel : relation.toModel;
      const externalModel = localModelNames.has(relation.fromModel) ? relation.toModel : relation.fromModel;
      const external = modelByName.get(externalModel);
      const direction = localModel === relation.toModel ? 'references external' : 'referenced by external';

      return {
        localModel,
        relationName: relation.relationName,
        externalDomain: external?.namespace ?? '-',
        externalModel,
        direction,
      };
    })
    .sort((a, b) =>
      [a.localModel, a.relationName, a.externalDomain, a.externalModel].join(':').localeCompare(
        [b.localModel, b.relationName, b.externalDomain, b.externalModel].join(':'),
      ),
    );
  const mermaid = generateMermaidErDiagram({ models, relations: localRelations });

  return [
    `# ${domain} ERD`,
    '',
    '> Generated from `prisma/models/*.prisma`. Do not edit by hand.',
    '> Regenerate with `npm run db:erd` or `npm run graphify:schema`.',
    '',
    '[Back to full ERD](../ERD.md)',
    '',
    '## Models',
    '',
    '| Model | Table | Description |',
    '|---|---|---|',
    ...models.map(
      (model) =>
        `| ${model.name} | \`${model.tableName}\` | ${escapeMarkdownTableCell(
          model.description || '-',
        )} |`,
    ),
    '',
    '## Mermaid ER Diagram',
    '',
    '```mermaid',
    mermaid.trimEnd(),
    '```',
    '',
    '## External References',
    '',
    externalReferences.length > 0
      ? [
          '| Local model | Relation | Direction | External domain | External model |',
          '|---|---|---|---|---|',
          ...externalReferences.map(
            (reference) =>
              `| ${reference.localModel} | ${reference.relationName} | ${reference.direction} | ${reference.externalDomain} | ${reference.externalModel} |`,
          ),
        ].join('\n')
      : 'No external references.',
    '',
  ].join('\n');
}

export async function writeErd({
  modelsDir = DEFAULT_MODELS_DIR,
  outputPath = DEFAULT_OUTPUT_PATH,
  domainOutputDir = DEFAULT_DOMAIN_OUTPUT_DIR,
} = {}) {
  const files = await readPrismaModelFiles(modelsDir);
  const schema = parsePrismaSchemaFiles(files);
  const domainErds = getDomainErdEntries(schema);
  const markdown = generateErdMarkdown(schema, {
    sourceFiles: files.map((file) => file.fileName),
    domainErds,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf8');
  await rm(domainOutputDir, { recursive: true, force: true });
  await mkdir(domainOutputDir, { recursive: true });

  await Promise.all(
    domainErds.map((entry) =>
      writeFile(path.join(domainOutputDir, entry.fileName), generateDomainErdMarkdown(schema, entry.domain), 'utf8'),
    ),
  );

  return {
    outputPath,
    domainOutputDir,
    modelCount: schema.models.length,
    relationCount: schema.relations.length,
    domainCount: domainErds.length,
  };
}

function collectDocComments(lines, modelLineIndex) {
  const docs = [];

  for (let index = modelLineIndex - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (line === '') continue;
    if (!line.startsWith('///')) break;
    docs.unshift(line);
  }

  return docs;
}

function collectModelBlock(lines, startIndex) {
  const block = [];
  let depth = 0;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    block.push(line);
    depth += countChar(line, '{') - countChar(line, '}');
    if (depth === 0) break;
  }

  return block;
}

function parseModelBlock(model, modelNames) {
  const blockText = model.block.join('\n');
  const namespace = extractDocValue(model.docs, '@namespace') || 'Uncategorized';
  const description = extractDocValue(model.docs, '@describe') || '';
  const tableName = blockText.match(/@@map\("([^"]+)"\)/)?.[1] ?? model.name;
  const uniqueSignatures = collectUniqueSignatures(model.block);
  const relationFieldNames = new Set();
  const relations = [];

  for (const rawLine of model.block.slice(1, -1)) {
    const line = stripInlineComment(rawLine).trim();
    if (!line || line.startsWith('@@')) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;

    const [fieldName, rawType] = parts;
    const baseType = normalizePrismaType(rawType);
    const relationFields = extractRelationFields(line);

    if (line.includes('@relation') && relationFields.length > 0 && modelNames.has(baseType)) {
      const optional = rawType.includes('?');
      const isUniqueRelation = hasExactUniqueSignature(uniqueSignatures, relationFields);

      relationFields.forEach((field) => relationFieldNames.add(field));
      relations.push({
        fromModel: baseType,
        toModel: model.name,
        relationName: fieldName,
        leftCardinality: optional ? 'o|' : '||',
        rightCardinality: isUniqueRelation ? (optional ? 'o|' : '||') : 'o{',
        fields: relationFields,
      });
    }
  }

  const fields = [];

  for (const rawLine of model.block.slice(1, -1)) {
    const line = stripInlineComment(rawLine).trim();
    if (!line || line.startsWith('@@')) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;

    const [fieldName, rawType] = parts;
    const baseType = normalizePrismaType(rawType);

    if (modelNames.has(baseType)) continue;

    fields.push({
      name: fieldName,
      type: sanitizeMermaidType(rawType),
      isPrimaryKey: line.includes('@id'),
      isForeignKey: relationFieldNames.has(fieldName),
      isUnique: line.includes('@unique') || hasExactUniqueSignature(uniqueSignatures, [fieldName]),
    });
  }

  return {
    fileName: model.fileName,
    startLine: model.startLine,
    name: model.name,
    namespace,
    description,
    tableName,
    fields,
    relations,
    uniqueSignatures,
  };
}

function collectUniqueSignatures(block) {
  const signatures = [];

  for (const rawLine of block) {
    const line = stripInlineComment(rawLine).trim();
    if (!line) continue;

    const fieldUnique = line.match(/^(\w+)\s+\S+.*@unique/);
    if (fieldUnique) signatures.push([fieldUnique[1]]);

    const modelUnique = line.match(/@@unique\(\s*\[([^\]]+)\]/);
    if (modelUnique) signatures.push(parseFieldList(modelUnique[1]));
  }

  return signatures;
}

function extractRelationFields(line) {
  const match = line.match(/fields:\s*\[([^\]]+)\]/);
  return match ? parseFieldList(match[1]) : [];
}

function parseFieldList(value) {
  return value
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

function hasExactUniqueSignature(signatures, fields) {
  return signatures.some(
    (signature) =>
      signature.length === fields.length && signature.every((field, index) => field === fields[index]),
  );
}

function extractDocValue(docs, tag) {
  const prefix = `/// ${tag}`;
  const line = docs.find((doc) => doc.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : '';
}

function stripInlineComment(line) {
  const commentIndex = line.indexOf('//');
  return commentIndex === -1 ? line : line.slice(0, commentIndex);
}

function normalizePrismaType(type) {
  return type.replace(/[?\[\]]/g, '');
}

function sanitizeMermaidType(type) {
  return type.replace('[]', 'Array').replace('?', '').replace(/[^\w]/g, '');
}

function slugifyDomain(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeMarkdownTableCell(value) {
  return value.replaceAll('|', '\\|').replace(/\r?\n/g, '<br>');
}

function countChar(value, char) {
  return [...value].filter((current) => current === char).length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await writeErd();
  const relativePath = path.relative(REPO_ROOT, result.outputPath);
  const relativeDomainPath = path.relative(REPO_ROOT, result.domainOutputDir);
  console.log(
    `Generated ${relativePath} and ${result.domainCount} domain ERDs under ${relativeDomainPath} from ${result.modelCount} models and ${result.relationCount} relations.`,
  );
}
