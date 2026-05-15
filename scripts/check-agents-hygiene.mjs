#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function listTracked(pattern) {
  const output = git(['ls-files', pattern]);
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

function checkClaudeShims() {
  const findings = [];
  for (const file of listTracked('*CLAUDE.md')) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf8').trim();
    if (content !== '@AGENTS.md') {
      findings.push({
        file,
        line: 1,
        name: 'CLAUDE.md drift',
        text: 'CLAUDE.md must contain only @AGENTS.md',
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
  for (const file of [...listTracked('AGENTS.md'), ...listTracked('**/AGENTS.md')]) {
    if (!existsSync(file)) continue;
    findings.push(...findStaleInstructionLines(file, readFileSync(file, 'utf8')));
  }

  for (const file of listTracked('.github/PULL_REQUEST_TEMPLATE.md')) {
    if (!existsSync(file)) continue;
    findings.push(...findStaleInstructionLines(file, readFileSync(file, 'utf8')));
  }

  findings.push(...checkClaudeShims());
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
