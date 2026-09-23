import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoupangRepresentativeImageRunnerAdapter } from './representative-image-runner.adapter';

const { spawned, FakeProcess } = vi.hoisted(() => {
  const { EventEmitter: Emitter } = require('node:events') as typeof import('node:events');
  class Fake extends Emitter {
    stdout = new Emitter();
    stderr = new Emitter();
  }
  return { spawned: [] as Array<{ args: string[]; proc: Fake }>, FakeProcess: Fake };
});

// Playwriter 는 외부 프로세스라 spawn 만 바꾼다.
vi.mock('./playwriter-process', () => ({
  spawnPlaywriter: (args: string[]) => {
    const proc = new FakeProcess();
    spawned.push({ args, proc });
    return proc;
  },
}));

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const image = { dataUrl: `data:image/png;base64,${PNG.toString('base64')}`, filename: 'gen-1.png' };

describe('CoupangRepresentativeImageRunnerAdapter', () => {
  const env = process.env.NODE_ENV;
  beforeEach(() => { spawned.length = 0; });
  afterEach(() => { process.env.NODE_ENV = env; });

  it('is blocked in production and never spawns Playwriter there', async () => {
    process.env.NODE_ENV = 'production';
    const runner = new CoupangRepresentativeImageRunnerAdapter();
    expect(runner.isBlocked()).toBe(true);
    await expect(runner.upload({ listing: { externalListingId: null, productName: '상품' }, image })).resolves.toMatchObject({ outcome: 'definitive_failure' });
    expect(spawned).toHaveLength(0);
  });

  it('writes the image to a file, runs the Wing script and reads SUCCESS as an upload', async () => {
    process.env.NODE_ENV = 'development';
    const runner = new CoupangRepresentativeImageRunnerAdapter();
    expect(runner.isBlocked()).toBe(false);
    const pending = runner.upload({ listing: { externalListingId: null, productName: '쿠팡 상품' }, image });
    await vi.waitFor(() => expect(spawned).toHaveLength(1));
    expect(fs.readFileSync('/tmp/wing-upload-input-gen-1.png')).toEqual(PNG);
    expect(spawned[0]!.args.at(-1)).toContain('/tmp/wing-upload-input-gen-1.png');
    spawned[0]!.proc.stdout.emit('data', Buffer.from('SUCCESS\n'));
    spawned[0]!.proc.emit('close', 0);
    await expect(pending).resolves.toEqual({ outcome: 'uploaded_pending_save', screenshotPath: '/tmp/wing-upload-gen-1.png' });
  });

  it('reads an ERROR line as a definitive failure', async () => {
    process.env.NODE_ENV = 'development';
    const pending = new CoupangRepresentativeImageRunnerAdapter().upload({ listing: { externalListingId: null, productName: '쿠팡 상품' }, image });
    await vi.waitFor(() => expect(spawned).toHaveLength(1));
    spawned[0]!.proc.stdout.emit('data', Buffer.from('ERROR:상품을 찾을 수 없습니다\n'));
    spawned[0]!.proc.emit('close', 1);
    await expect(pending).resolves.toEqual({ outcome: 'definitive_failure', error: '상품을 찾을 수 없습니다' });
  });

  it('throws when Playwriter exits with no ERROR line, because the image may already sit in the dropzone', async () => {
    process.env.NODE_ENV = 'development';
    const pending = new CoupangRepresentativeImageRunnerAdapter().upload({ listing: { externalListingId: null, productName: '쿠팡 상품' }, image });
    await vi.waitFor(() => expect(spawned).toHaveLength(1));
    spawned[0]!.proc.stderr.emit('data', Buffer.from('Timeout 90000ms exceeded\n'));
    spawned[0]!.proc.emit('close', null, 'SIGTERM');
    await expect(pending).rejects.toThrow('Timeout 90000ms exceeded');
  });

  it('throws when the Playwriter process fails, since the outcome is unknown', async () => {
    process.env.NODE_ENV = 'development';
    const pending = new CoupangRepresentativeImageRunnerAdapter().upload({ listing: { externalListingId: null, productName: '쿠팡 상품' }, image });
    await vi.waitFor(() => expect(spawned).toHaveLength(1));
    spawned[0]!.proc.emit('error', new Error('spawn playwriter EPIPE'));
    await expect(pending).rejects.toThrow('spawn playwriter EPIPE');
  });
});
