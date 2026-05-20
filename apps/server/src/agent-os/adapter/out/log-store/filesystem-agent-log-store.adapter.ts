import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  type AgentLogStorePort,
  type PutLogInput,
  type PutLogResult,
} from '../../../application/port/out/storage/agent-log-store.port';

const LOG_BASE = resolve(process.cwd(), '.agent-os/logs');

@Injectable()
export class FilesystemAgentLogStoreAdapter implements AgentLogStorePort {
  async put(input: PutLogInput): Promise<PutLogResult> {
    const dir = join(LOG_BASE, input.organizationId);
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${input.runId}.jsonl`);
    await writeFile(file, input.payload, { encoding: 'utf8' });
    const sha256 = createHash('sha256').update(input.payload).digest('hex');
    return {
      store: 'filesystem',
      ref: file,
      bytes: BigInt(Buffer.byteLength(input.payload, 'utf8')),
      sha256,
    };
  }
}
