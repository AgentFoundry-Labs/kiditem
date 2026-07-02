#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const options = {
  root: process.cwd(),
  limit: 32768,
  top: 10,
  targets: [],
  includeHidden: false,
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--root') options.root = args[++index];
  else if (arg === '--limit') options.limit = Number(args[++index]);
  else if (arg === '--top') options.top = Number(args[++index]);
  else if (arg === '--target') options.targets.push(args[++index]);
  else if (arg === '--include-hidden') options.includeHidden = true;
  else if (arg === '-h' || arg === '--help') usage(0);
  else {
    console.error(`Unknown argument: ${arg}`);
    usage(2);
  }
}

const root = path.resolve(options.root);
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Root is not a directory: ${root}`);
  process.exit(1);
}

const files = findInstructionFiles(root, options.includeHidden);
const agentsFiles = files.filter((file) => path.basename(file) === 'AGENTS.md');
const overrideFiles = files.filter((file) => path.basename(file) === 'AGENTS.override.md');
const allText = new Map(files.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const chains = chainTargets(root, agentsFiles, options.targets).map((target) => {
  const chain = instructionChain(root, target, allText);
  const bytes = chain.reduce((sum, file) => sum + Buffer.byteLength(allText.get(file), 'utf8'), 0);
  return { target, chain, bytes };
});

const folderMapCount = countPattern(allText, /^## Folder Map$/gm);
const verificationCount = countPattern(allText, /^## Verification$/gm);
const emptyTextBlocks = matchFiles(allText, /```text\s*```/m);
const emptyVerification = matchFiles(allText, /^## Verification\s*\n\s*## /m);
const oversized = chains.filter((item) => item.bytes > options.limit);
const sortedChains = [...chains].sort((a, b) => b.bytes - a.bytes).slice(0, options.top);

console.log(`AGENTS.md audit for ${root}`);
console.log('');
console.log('Counts');
console.log(`  AGENTS.md: ${agentsFiles.length}`);
console.log(`  AGENTS.override.md: ${overrideFiles.length}`);
console.log(`  Folder Map sections: ${folderMapCount}`);
console.log(`  Verification sections: ${verificationCount}`);
console.log(`  Byte limit: ${options.limit}`);
console.log('');

console.log(`Top ${sortedChains.length} active chains by byte size`);
for (const item of sortedChains) {
  const marker = item.bytes > options.limit ? 'OVER' : 'OK';
  console.log(`  ${marker} ${item.bytes.toString().padStart(6)}  ${rel(root, item.target) || '.'}`);
  for (const file of item.chain) {
    console.log(`          - ${rel(root, file)}`);
  }
}

if (overrideFiles.length > 0) {
  console.log('');
  console.log('Override files');
  for (const file of overrideFiles) console.log(`  - ${rel(root, file)}`);
}

if (oversized.length > 0 || emptyTextBlocks.length > 0 || emptyVerification.length > 0) {
  console.log('');
  console.log('Findings');
  for (const item of oversized) {
    console.log(`  - Active chain exceeds limit: ${rel(root, item.target) || '.'} (${item.bytes} bytes)`);
  }
  for (const file of emptyTextBlocks) {
    console.log(`  - Empty text code block: ${rel(root, file)}`);
  }
  for (const file of emptyVerification) {
    console.log(`  - Empty Verification section: ${rel(root, file)}`);
  }
}

if (oversized.length > 0 || emptyTextBlocks.length > 0 || emptyVerification.length > 0) {
  process.exitCode = 1;
}

function usage(code) {
  console.log(`Usage: node audit-agents-md.mjs [--root DIR] [--limit BYTES] [--top N] [--target DIR] [--include-hidden]

Audits AGENTS.md discovery chains, size budget, override files, and simple
section hygiene. Hidden directories are skipped unless --include-hidden is set.`);
  process.exit(code);
}

function findInstructionFiles(base, includeHidden) {
  const skipNames = new Set([
    '.git',
    'node_modules',
    '.next',
    'dist',
    'build',
    'coverage',
    'graphify-out',
  ]);
  const found = [];
  const stack = [base];

  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipNames.has(entry.name)) continue;
        if (!includeHidden && entry.name.startsWith('.')) continue;
        stack.push(full);
      } else if (entry.isFile() && (entry.name === 'AGENTS.md' || entry.name === 'AGENTS.override.md')) {
        found.push(full);
      }
    }
  }

  return found.sort();
}

function chainTargets(base, agents, explicitTargets) {
  if (explicitTargets.length > 0) {
    return explicitTargets.map((target) => path.resolve(base, target));
  }
  return [...new Set(agents.map((file) => path.dirname(file)))].sort();
}

function instructionChain(base, target, textByFile) {
  const dirs = [];
  let current = path.resolve(target);
  while (current.startsWith(base)) {
    dirs.push(current);
    if (current === base) break;
    current = path.dirname(current);
  }

  return dirs.reverse().flatMap((dir) => {
    const override = path.join(dir, 'AGENTS.override.md');
    const regular = path.join(dir, 'AGENTS.md');
    if (textByFile.has(override)) return [override];
    if (textByFile.has(regular)) return [regular];
    return [];
  });
}

function countPattern(textByFile, pattern) {
  let count = 0;
  for (const text of textByFile.values()) {
    count += [...text.matchAll(pattern)].length;
  }
  return count;
}

function matchFiles(textByFile, pattern) {
  return [...textByFile.entries()]
    .filter(([, text]) => pattern.test(text))
    .map(([file]) => file)
    .sort();
}

function rel(base, file) {
  return path.relative(base, file);
}
