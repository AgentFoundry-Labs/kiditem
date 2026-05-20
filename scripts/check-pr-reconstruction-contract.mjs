#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REQUIRED_LABELS = [
  'Trigger',
  'Scope decision',
  'Contract / AGENTS update',
  'Behavior lock tests',
  'Verification gate',
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

function ghPrBody() {
  try {
    const out = execFileSync(
      'gh',
      ['pr', 'view', '--json', 'body', '--jq', '.body'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

function readPrBody({ body, bodyFile, event }) {
  if (body) return body;

  // In CI, the event payload (GITHUB_EVENT_PATH) is replayed verbatim when
  // a workflow run is re-run, so a stale body can persist across reruns even
  // after `gh pr edit`. Prefer `gh pr view` to read the live body, then fall
  // back to the event file. The workflow exposes `GH_TOKEN` from GITHUB_TOKEN
  // so this is authenticated automatically.
  if (process.env.GITHUB_ACTIONS === 'true') {
    const live = ghPrBody();
    if (live) return live;
  }

  const file = bodyFile || event || process.env.GITHUB_EVENT_PATH;
  if (file && existsSync(file)) {
    const raw = readFileSync(file, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      return parsed.pull_request?.body || parsed.body || '';
    } catch {
      return raw;
    }
  }

  const live = ghPrBody();
  return live || '';
}

function changedFilesFromGit(base, head) {
  const output = git(['diff', '--name-only', `${base}...${head}`]);
  return output ? output.split('\n').filter(Boolean) : [];
}

function lineCount(file) {
  if (!existsSync(file)) return 0;
  return readFileSync(file, 'utf8').split(/\r?\n/).length;
}

function layerOf(file) {
  if (file.startsWith('apps/server/')) return 'server';
  if (file.startsWith('apps/web/')) return 'web';
  if (file.startsWith('packages/shared/')) return 'shared';
  if (file.startsWith('agents/')) return 'agents';
  if (file.startsWith('prisma/')) return 'prisma';
  return null;
}

function isLargeServiceOrComponent(file, lines) {
  return (
    lines >= 500 &&
    /\.(service|component|controller|page)\.(ts|tsx)$/.test(file)
  );
}

function isHighRiskBoundary(file) {
  if (!/\.(ts|tsx|js|mjs|md)$/.test(file)) return false;
  const highRisk =
    /(prompt|model|provider|gemini|genai|media|image|storage|fetch|agent-runtime|agent-output|direct-output|direct-generation|bridge|sink|reconcile)/i;
  const relevantOwner =
    /^(apps\/server\/src\/(ai|agent-os|automation)|apps\/web\/src\/app\/.*(media-ai|sourcing)|packages\/shared\/src)/;
  return highRisk.test(file) && relevantOwner.test(file);
}

function isCrossLayerControlChange(files) {
  const layers = new Set(files.map(layerOf).filter(Boolean));
  const hasControlFile = files.some((file) =>
    /(dto|schema|schemas|contract|control|generate|detail-page|thumbnail|agent-output|direct-generation)/i.test(file),
  );
  return hasControlFile && layers.size >= 2;
}

export function analyzeReconstructionTriggers(files, lineCounts = {}) {
  const triggers = [];

  if (files.length >= 10) {
    triggers.push(`10+ files changed (${files.length})`);
  }

  const largeFiles = files.filter((file) =>
    isLargeServiceOrComponent(file, lineCounts[file] ?? lineCount(file)),
  );
  if (largeFiles.length > 0) {
    triggers.push(`500+ line service/component touched: ${largeFiles.join(', ')}`);
  }

  const risky = files.filter(isHighRiskBoundary);
  if (risky.length > 0) {
    triggers.push(`high-risk AI/runtime/media boundary touched: ${risky.join(', ')}`);
  }

  if (isCrossLayerControlChange(files)) {
    triggers.push('cross-layer control/contract change');
  }

  return triggers;
}

export function missingBodyFields(body) {
  const missing = [];
  for (const label of REQUIRED_LABELS) {
    // Tolerate common Markdown decoration between the label and the colon:
    //   "**Trigger**:", "*Trigger*:", "__Trigger__:", "`Trigger`:".
    // The opening markers before the label do not need to match because the
    // regex is unanchored. Trailing markdown that would otherwise consume the
    // colon (e.g. `**Trigger**:` -> the second `**` sits between Trigger and `:`)
    // is what we need to skip.
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escapedLabel}[*_\`]*[ \\t]*:[ \\t]*([^\\n\\r]*)`, 'i');
    const match = body.match(re);
    const value = (match?.[1] ?? '')
      // Strip leading bold/italic/code openers on the value side as well.
      .replace(/^[*_`]+/, '')
      .trim();
    if (!value || /^(?:TBD|TODO|N\/A|-|_)$/i.test(value)) missing.push(label);
  }
  return missing;
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
  const body = readPrBody(args);
  const triggers = analyzeReconstructionTriggers(files);

  if (triggers.length === 0) {
    console.log('check:pr-reconstruction PASS — no reconstruction trigger');
    return;
  }

  const missing = missingBodyFields(body);
  if (missing.length === 0) {
    console.log('check:pr-reconstruction PASS');
    console.log(`Triggers: ${triggers.join('; ')}`);
    return;
  }

  console.error('check:pr-reconstruction FAIL');
  console.error(`Triggers: ${triggers.join('; ')}`);
  console.error(`Missing or blank PR body fields: ${missing.join(', ')}`);
  console.error('Fill the Architecture / Reconstruction Review section before merge.');
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
