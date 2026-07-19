#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

export function findClaudeShimFindings(agentFiles, claudeContents) {
  const findings = [];
  const agentFileSet = new Set(agentFiles);
  for (const agentFile of agentFiles) {
    const claudeFile = join(dirname(agentFile), 'CLAUDE.md');
    if (!claudeContents.has(claudeFile)) {
      findings.push({
        file: claudeFile,
        line: 1,
        name: 'missing CLAUDE.md shim',
        text: 'Every AGENTS.md must have a same-directory CLAUDE.md containing only @AGENTS.md',
      });
      continue;
    }
    if (claudeContents.get(claudeFile).trim() !== '@AGENTS.md') {
      findings.push({
        file: claudeFile,
        line: 1,
        name: 'CLAUDE.md drift',
        text: 'CLAUDE.md must contain only @AGENTS.md',
      });
    }
  }
  for (const claudeFile of claudeContents.keys()) {
    const agentFile = join(dirname(claudeFile), 'AGENTS.md');
    if (!agentFileSet.has(agentFile)) {
      findings.push({
        file: claudeFile,
        line: 1,
        name: 'orphan CLAUDE.md shim',
        text: 'CLAUDE.md shim requires a same-directory AGENTS.md',
      });
    }
  }
  return findings;
}

export function findInstructionChainSizeFindings(
  agentContents,
  limitBytes = 28 * 1024,
) {
  const findings = [];
  for (const agentFile of agentContents.keys()) {
    const chain = [];
    let directory = dirname(agentFile);
    while (true) {
      const candidate = join(directory, 'AGENTS.md');
      if (agentContents.has(candidate)) chain.unshift(candidate);
      if (directory === '.') break;
      directory = dirname(directory);
    }

    const size = chain.reduce(
      (total, file) => total + Buffer.byteLength(agentContents.get(file)),
      0,
    );
    if (size > limitBytes) {
      findings.push({
        file: agentFile,
        line: 1,
        name: 'AGENTS.md active chain too large',
        text: `Active AGENTS.md chain is ${size} bytes; limit is ${limitBytes} bytes`,
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
  const agentFiles = listRepositoryFiles(['AGENTS.md', '**/AGENTS.md'])
    .filter((file) => existsSync(file));
  const agentContents = new Map(
    agentFiles.map((file) => [file, readFileSync(file, 'utf8')]),
  );
  for (const [file, content] of agentContents) {
    findings.push(...findStaleInstructionLines(file, content));
  }

  for (const file of listTracked('.github/PULL_REQUEST_TEMPLATE.md')) {
    if (!existsSync(file)) continue;
    findings.push(...findStaleInstructionLines(file, readFileSync(file, 'utf8')));
  }

  const claudeContents = new Map(
    listRepositoryFiles(['CLAUDE.md', '**/CLAUDE.md'])
      .filter((file) => existsSync(file))
      .map((file) => [file, readFileSync(file, 'utf8')]),
  );
  findings.push(...findClaudeShimFindings(agentFiles, claudeContents));
  findings.push(...findInstructionChainSizeFindings(agentContents));
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
