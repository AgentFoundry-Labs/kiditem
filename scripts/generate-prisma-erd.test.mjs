import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  generateErdMarkdown,
  generateMermaidErDiagram,
  parsePrismaSchemaFiles,
  writeErd,
} from './generate-prisma-erd.mjs';

const fixture = [
  {
    fileName: 'core.prisma',
    content: `
/// @namespace Core
/// @describe 회사/테넌트 루트.
model Company {
  id    String @id @default(uuid()) @db.Uuid
  name  String
  users User[]

  @@map("companies")
}

/// @namespace Core
/// @describe 사용자 계정.
model User {
  id        String  @id @default(uuid()) @db.Uuid
  companyId String  @map("company_id") @db.Uuid
  email     String  @unique

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@map("users")
}
`,
  },
];

test('parsePrismaSchemaFiles extracts models, domain docs, table maps, fields, and relations', () => {
  const schema = parsePrismaSchemaFiles(fixture);

  assert.equal(schema.models.length, 2);
  assert.equal(schema.relations.length, 1);

  const company = schema.models.find((model) => model.name === 'Company');
  assert.equal(company.namespace, 'Core');
  assert.equal(company.description, '회사/테넌트 루트.');
  assert.equal(company.tableName, 'companies');
  assert.equal(company.fields.find((field) => field.name === 'id').isPrimaryKey, true);

  const user = schema.models.find((model) => model.name === 'User');
  assert.equal(user.tableName, 'users');
  assert.equal(user.fields.find((field) => field.name === 'email').isUnique, true);

  assert.deepEqual(schema.relations[0], {
    fromModel: 'Company',
    toModel: 'User',
    relationName: 'company',
    leftCardinality: '||',
    rightCardinality: 'o{',
    fields: ['companyId'],
  });
});

test('generateMermaidErDiagram renders a usable Mermaid ER diagram', () => {
  const schema = parsePrismaSchemaFiles(fixture);
  const mermaid = generateMermaidErDiagram(schema);

  assert.match(mermaid, /^erDiagram/m);
  assert.match(mermaid, /Company \{/);
  assert.match(mermaid, /String id PK/);
  assert.match(mermaid, /String email UK/);
  assert.match(mermaid, /Company \|\|--o\{ User : "company"/);
});

test('generateErdMarkdown documents regeneration command and embeds the diagram', () => {
  const schema = parsePrismaSchemaFiles(fixture);
  const markdown = generateErdMarkdown(schema, { sourceFiles: ['core.prisma'] });

  assert.match(markdown, /# Database ERD/);
  assert.match(markdown, /npm run db:erd/);
  assert.match(markdown, /npm run graphify:schema/);
  assert.match(markdown, /## Domain ERDs/);
  assert.match(markdown, /\[Core\]\(erd\/core\.md\)/);
  assert.match(markdown, /```mermaid\n/);
  assert.match(markdown, /\| Company \| Core \| `companies` \| 회사\/테넌트 루트\. \|/);
});

test('writeErd writes readable domain ERDs and keeps external references outside the diagram', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'kiditem-erd-'));

  try {
    const modelsDir = path.join(workspace, 'models');
    const outputPath = path.join(workspace, 'docs', 'ERD.md');
    const domainOutputDir = path.join(workspace, 'docs', 'erd');
    await mkdir(modelsDir, { recursive: true });

    await writeFile(
      path.join(modelsDir, 'core.prisma'),
      `
/// @namespace Core
/// @describe Tenant root.
model Company {
  id          String          @id @db.Uuid
  inventory  Inventory[]

  @@map("companies")
}

/// @namespace Core
/// @describe Physical sellable SKU.
model ProductOption {
  id        String     @id @db.Uuid
  inventory Inventory?

  @@map("product_options")
}
`,
      'utf8',
    );

    await writeFile(
      path.join(modelsDir, 'inventory.prisma'),
      `
/// @namespace Inventory
/// @describe Stock position.
model Inventory {
  id          String        @id @db.Uuid
  companyId   String        @db.Uuid
  optionId    String        @unique @db.Uuid
  warehouseId String?       @db.Uuid
  company     Company       @relation(fields: [companyId], references: [id])
  option      ProductOption @relation(fields: [optionId], references: [id])
  warehouse   Warehouse?    @relation(fields: [warehouseId], references: [id])

  @@map("inventory")
}

/// @namespace Inventory
/// @describe Storage location.
model Warehouse {
  id         String      @id @db.Uuid
  companyId  String      @db.Uuid
  company    Company     @relation(fields: [companyId], references: [id])
  inventory  Inventory[]

  @@map("warehouses")
}
`,
      'utf8',
    );

    const result = await writeErd({ modelsDir, outputPath, domainOutputDir });

    assert.equal(result.domainCount, 2);

    const index = await readFile(outputPath, 'utf8');
    assert.match(index, /## Domain ERDs/);
    assert.match(index, /\[Core\]\(erd\/core\.md\)/);
    assert.match(index, /\[Inventory\]\(erd\/inventory\.md\)/);

    const domainFiles = await readdir(domainOutputDir);
    assert.deepEqual(domainFiles.sort(), ['core.md', 'inventory.md']);

    const inventory = await readFile(path.join(domainOutputDir, 'inventory.md'), 'utf8');
    assert.match(inventory, /^# Inventory ERD/m);
    assert.match(inventory, /## Mermaid ER Diagram/);
    assert.match(inventory, /Inventory \{/);
    assert.match(inventory, /Warehouse \{/);
    assert.doesNotMatch(inventory, /Company \{/);
    assert.match(inventory, /Inventory \| company \| references external \| Core \| Company/);
    assert.match(inventory, /Inventory \| option \| references external \| Core \| ProductOption/);
    assert.match(inventory, /Warehouse \| company \| references external \| Core \| Company/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
