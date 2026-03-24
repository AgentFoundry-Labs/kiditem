/**
 * Generate JSON Schema from Zod schemas.
 *
 * Usage: pnpm generate:schema
 *
 * Output: dist/schemas/ directory with JSON Schema files.
 * These can be used with `datamodel-code-generator` to generate Python Pydantic models:
 *
 *   pip install datamodel-code-generator
 *   datamodel-codegen --input dist/schemas/detail-page-data.json --output models.py
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  CSInfoSchema,
  DetailPageDataSchema,
  FeatureItemSchema,
  KeyPointItemSchema,
  LayoutConfigSchema,
  MaterialItemSchema,
  SpecItemSchema,
} from '../schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../../dist/schemas');
mkdirSync(outDir, { recursive: true });

const schemas = {
  'detail-page-data': DetailPageDataSchema,
  'feature-item': FeatureItemSchema,
  'spec-item': SpecItemSchema,
  'key-point-item': KeyPointItemSchema,
  'material-item': MaterialItemSchema,
  'cs-info': CSInfoSchema,
  'layout-config': LayoutConfigSchema,
};

for (const [name, schema] of Object.entries(schemas)) {
  const jsonSchema = zodToJsonSchema(schema, { name, target: 'jsonSchema7' });
  const path = resolve(outDir, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(jsonSchema, null, 2)}\n`);
  console.log(`  ✓ ${name}.json`);
}

console.log(`\nGenerated ${Object.keys(schemas).length} JSON Schema files in dist/schemas/`);
