import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunnerInstallationTokenService } from './runner-installation-token.service';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe('RunnerInstallationTokenService', () => {
  it('loads only a protected-file token as a 32-byte unpadded base64url digest', async () => {
    const raw = randomBytes(32).toString('base64url');
    expect(raw).toHaveLength(43);
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const tokenFilePath = await secretFile(raw);
    const compare = vi.fn((left: Buffer, right: Buffer) => timingSafeEqual(left, right));
    const service = new RunnerInstallationTokenService({
      tokenFilePath,
      timingSafeEqual: compare,
    });

    await service.initialize();

    expect(service.authenticate(raw)).toBe(true);
    expect(service.authenticate(randomBytes(32).toString('base64url'))).toBe(false);
    expect(compare).toHaveBeenCalled();
    expect(Object.values(service)).not.toContain(raw);
    expect(JSON.stringify(service)).not.toContain(raw);
  });

  it('does not accept an ordinary environment token and never renders a raw secret in failures', async () => {
    const raw = randomBytes(32).toString('base64url');
    const service = new RunnerInstallationTokenService({
      environment: { KIDITEM_AGENT_RUNNER_TOKEN: raw },
    });

    await expect(service.initialize()).rejects.toThrow('runner_installation_token_file_required');
    await expect(service.initialize()).rejects.not.toThrow(raw);
  });

  it('rejects a file value that is not exactly one 32-byte unpadded base64url token', async () => {
    const tokenFilePath = await secretFile('not-a-runner-token');
    const service = new RunnerInstallationTokenService({ tokenFilePath });

    await expect(service.initialize()).rejects.toThrow('runner_installation_token_invalid');
  });
});

async function secretFile(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'kiditem-runner-token-'));
  temporaryDirectories.push(directory);
  const filename = join(directory, 'runner-token');
  await writeFile(filename, `${contents}\n`, { encoding: 'utf8', mode: 0o600 });
  return filename;
}
