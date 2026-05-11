#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCHEMA_PATHS = ['prisma/schema.prisma', 'prisma/models/'];
const GENERATED_ARTIFACT_PATHS = [
  'docs/ERD.md',
  'docs/erd/',
  'graphify-out/',
];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

function changedFilesFromGit(base, head) {
  const output = git(['diff', '--name-only', `${base}...${head}`]);
  return output ? output.split('\n').filter(Boolean) : [];
}

function matchesAnyPath(file, paths) {
  return paths.some((target) => {
    if (target.endsWith('/')) return file.startsWith(target);
    return file === target;
  });
}

export function analyzeSchemaArtifactSync(files) {
  const schemaFiles = files.filter((file) => matchesAnyPath(file, SCHEMA_PATHS));
  const generatedArtifacts = files.filter((file) =>
    matchesAnyPath(file, GENERATED_ARTIFACT_PATHS),
  );

  return {
    schemaFiles,
    generatedArtifacts,
    requiresGeneratedArtifacts: schemaFiles.length > 0,
    hasGeneratedArtifacts: generatedArtifacts.length > 0,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const base =
    args.base ||
    (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/develop');
  const head = args.head || 'HEAD';
  const files = args.files
    ? args.files.split(',').map((file) => file.trim()).filter(Boolean)
    : changedFilesFromGit(base, head);

  const result = analyzeSchemaArtifactSync(files);

  if (!result.requiresGeneratedArtifacts) {
    console.log('check:schema-artifact-sync PASS — no Prisma schema change');
    return;
  }

  if (result.hasGeneratedArtifacts) {
    console.log('check:schema-artifact-sync PASS');
    console.log(`Schema files: ${result.schemaFiles.join(', ')}`);
    console.log(`Generated artifacts: ${result.generatedArtifacts.join(', ')}`);
    return;
  }

  console.error('check:schema-artifact-sync FAIL');
  console.error(`Schema files changed: ${result.schemaFiles.join(', ')}`);
  console.error(
    'Missing generated navigation artifact changes: docs/ERD.md, docs/erd/**, or graphify-out/**',
  );
  console.error('Run npm run db:erd and npm run graphify:schema, then commit the generated output.');
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
