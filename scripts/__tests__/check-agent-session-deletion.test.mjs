import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scannerPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'check-agent-session-deletion.mjs',
);

function writeFixtureFile(rootDir, relativePath, source) {
  const absolutePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source);
}

function fixture(files) {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'kiditem-agent-session-deletion-'));
  for (const [relativePath, source] of Object.entries(files)) {
    writeFixtureFile(rootDir, relativePath, source);
  }
  return rootDir;
}

function runScanner(rootDir) {
  return spawnSync(process.execPath, [scannerPath], {
    cwd: rootDir,
    encoding: 'utf8',
  });
}

function withFixture(files, assertResult) {
  const rootDir = fixture(files);
  try {
    assertResult(runScanner(rootDir));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

test('rejects every retired lifecycle concept', () => {
  withFixture(
    {
      'prisma/models/agents.prisma': 'model AgentSessionTombstone {}',
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AgentSessionTombstone/);
    },
  );
});

test('rejects raw artifact references and a second deletion worker', () => {
  withFixture(
    {
      'apps/server/src/agent-os/a.ts': 'const storageReference = input.path;',
      'apps/server/src/agent-os/b.ts': 'setInterval(runDeletion, 1000);',
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /storageReference/);
      assert.match(result.stderr, /second deletion scheduler/);
    },
  );
});
