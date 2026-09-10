#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';

const { dirname, join } = posix;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function listTracked(pattern) {
  const output = git(['ls-files', pattern]);
  return output ? output.split('\n').filter(Boolean) : [];
}

function listRepositoryFiles(patterns) {
  const output = git([
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    ...patterns,
  ]);
  return output ? output.split('\n').filter(Boolean) : [];
}

export function findStaleInstructionLines(file, content) {
  const stalePatterns = [
    { name: 'phase/wave history', re: /\b(?:Phase|Wave)\s+[A-Z0-9][^\n]*/i },
    { name: 'PR-number history', re: /\bPR\s+#\d+\b/i },
    { name: 'plan completion history', re: /\bPlan\s+[A-Z0-9][^\n]*(?:완료|completed|migration|migrate)\b/i },
    { name: 'placeholder', re: /\b(?:TODO|TBD)\b/i },
    { name: 'deferred work note', re: /(?:follow-up|후속)\s+(?:PR|issue|issues|work|작업|이슈|lane|plan)/i },
    { name: 'Claude review command', re: /\bclaude\s+\/review\b/i },
    {
      name: 'generic instruction boilerplate',
      re: /^Consult this document first instead of relying on memorized knowledge\.$/i,
    },
  ];

  const allow = [
    /No follow-up issues/i,
    /vague follow-up/i,
    /do not park/i,
  ];

  const findings = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (allow.some((pattern) => pattern.test(line))) return;
    for (const pattern of stalePatterns) {
      if (pattern.re.test(line)) {
        findings.push({
          file,
          line: index + 1,
          name: pattern.name,
          text: line.trim(),
        });
      }
    }
  });
  return findings;
}

export function findLegacyInstructionFindings(legacyFiles) {
  return legacyFiles.map((file) => ({
    file,
    line: 1,
    name: 'legacy instruction file',
    text: 'Instruction guides must use CLAUDE.md; remove the legacy AGENTS file',
  }));
}

export function findInstructionChainSizeFindings(
  instructionContents,
  limitBytes = 32 * 1024,
) {
  const findings = [];
  for (const instructionFile of instructionContents.keys()) {
    const chain = [];
    let directory = dirname(instructionFile);
    while (true) {
      const candidate = join(directory, 'CLAUDE.md');
      if (instructionContents.has(candidate)) chain.unshift(candidate);
      if (directory === '.') break;
      directory = dirname(directory);
    }

    const size = chain.reduce(
      (total, file) =>
        total + Buffer.byteLength(instructionContents.get(file)),
      0,
    );
    if (size >= limitBytes) {
      findings.push({
        file: instructionFile,
        line: 1,
        name: 'CLAUDE.md active chain reached byte limit',
        text: `Active CLAUDE.md chain is ${size} bytes; it must stay below ${limitBytes} bytes`,
      });
    }
  }
  return findings;
}

function checkTrackedClaudeDirectory() {
  return listTracked('.claude')
    .filter((file) => existsSync(file))
    .map((file) => ({
      file,
      line: 1,
      name: 'tracked .claude file',
      text: '.claude/ is user/session-local and must not be committed',
    }));
}

export function runChecks() {
  const findings = [];
  const legacyInstructionFiles = listRepositoryFiles([
    'AGENTS.md',
    '**/AGENTS.md',
    'AGENTS.override.md',
    '**/AGENTS.override.md',
  ])
    .filter((file) => existsSync(file));
  findings.push(...findLegacyInstructionFindings(legacyInstructionFiles));

  const claudeContents = new Map(
    listRepositoryFiles(['CLAUDE.md', '**/CLAUDE.md'])
      .filter((file) => existsSync(file))
      .map((file) => [file, readFileSync(file, 'utf8')]),
  );
  for (const [file, content] of claudeContents) {
    findings.push(...findStaleInstructionLines(file, content));
  }

  for (const file of listTracked('.github/PULL_REQUEST_TEMPLATE.md')) {
    if (!existsSync(file)) continue;
    findings.push(...findStaleInstructionLines(file, readFileSync(file, 'utf8')));
  }

  findings.push(...findInstructionChainSizeFindings(claudeContents));
  findings.push(...checkTrackedClaudeDirectory());
  return findings;
}

function main() {
  const findings = runChecks();
  if (findings.length === 0) {
    console.log('check:agents-hygiene PASS');
    return;
  }

  console.error('check:agents-hygiene FAIL');
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} [${finding.name}] ${finding.text}`,
    );
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
