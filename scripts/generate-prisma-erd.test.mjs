import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateErdMarkdown,
  generateMermaidErDiagram,
  parsePrismaSchemaFiles,
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
  assert.match(markdown, /```mermaid\n/);
  assert.match(markdown, /\| Company \| Core \| `companies` \| 회사\/테넌트 루트\. \|/);
});
