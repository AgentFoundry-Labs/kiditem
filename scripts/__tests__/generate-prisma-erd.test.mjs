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
} from '../generate-prisma-erd.mjs';

const fixture = [
  {
    fileName: 'core.prisma',
    content: `
/// @namespace Core
/// @describe 회사/테넌트 루트.
model Organization {
  id    String @id @default(uuid()) @db.Uuid
  name  String
  users User[]

  @@map("organizations")
}

/// @namespace Core
/// @describe 사용자 계정.
model User {
  id        String  @id @default(uuid()) @db.Uuid
  organizationId String  @map("organization_id") @db.Uuid
  email     String  @unique

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("users")
}
`,
  },
];

test('parsePrismaSchemaFiles extracts models, domain docs, table maps, fields, and relations', () => {
  const schema = parsePrismaSchemaFiles(fixture);

  assert.equal(schema.models.length, 2);
  assert.equal(schema.relations.length, 1);

  const organization = schema.models.find((model) => model.name === 'Organization');
  assert.equal(organization.namespace, 'Core');
  assert.equal(organization.description, '회사/테넌트 루트.');
  assert.equal(organization.tableName, 'organizations');
  assert.equal(organization.fields.find((field) => field.name === 'id').isPrimaryKey, true);

  const user = schema.models.find((model) => model.name === 'User');
  assert.equal(user.tableName, 'users');
  assert.equal(user.fields.find((field) => field.name === 'email').isUnique, true);

  assert.deepEqual(schema.relations[0], {
    fromModel: 'Organization',
    toModel: 'User',
    relationName: 'organization',
    leftCardinality: '||',
    rightCardinality: 'o{',
    fields: ['organizationId'],
  });
});

test('generateMermaidErDiagram renders a usable Mermaid ER diagram', () => {
  const schema = parsePrismaSchemaFiles(fixture);
  const mermaid = generateMermaidErDiagram(schema);

  assert.match(mermaid, /^erDiagram/m);
  assert.match(mermaid, /Organization \{/);
  assert.match(mermaid, /String id PK/);
  assert.match(mermaid, /String email UK/);
  assert.match(mermaid, /Organization \|\|--o\{ User : "organization"/);
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
  assert.match(markdown, /\| Organization \| Core \| `organizations` \| 회사\/테넌트 루트\. \|/);
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
model Organization {
  id          String          @id @db.Uuid
  inventory  Inventory[]

  @@map("organizations")
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
  organizationId   String        @db.Uuid
  optionId    String        @unique @db.Uuid
  warehouseId String?       @db.Uuid
  organization     Organization       @relation(fields: [organizationId], references: [id])
  option      ProductOption @relation(fields: [optionId], references: [id])
  warehouse   Warehouse?    @relation(fields: [warehouseId], references: [id])

  @@map("inventory")
}

/// @namespace Inventory
/// @describe Storage location.
model Warehouse {
  id         String      @id @db.Uuid
  organizationId  String      @db.Uuid
  organization    Organization     @relation(fields: [organizationId], references: [id])
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
    assert.doesNotMatch(inventory, /Organization \{/);
    assert.match(inventory, /Inventory \| organization \| references external \| Core \| Organization/);
    assert.match(inventory, /Inventory \| option \| references external \| Core \| ProductOption/);
    assert.match(inventory, /Warehouse \| organization \| references external \| Core \| Organization/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
