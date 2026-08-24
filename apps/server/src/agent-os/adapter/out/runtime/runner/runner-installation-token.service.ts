import { createHash, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';
import { readFile as nodeReadFile } from 'node:fs/promises';
import { Injectable, type OnModuleInit } from '@nestjs/common';

type DigestComparator = (left: Buffer, right: Buffer) => boolean;

export interface RunnerInstallationTokenServiceOptions {
  tokenFilePath?: string;
  environment?: NodeJS.ProcessEnv;
  readFile?: (filename: string, encoding: BufferEncoding) => Promise<string>;
  timingSafeEqual?: DigestComparator;
}

/**
 * Loads the Runner installation bearer once from the mounted secret file.
 * The raw value exists only inside initialize() long enough to derive a digest.
 */
@Injectable()
export class RunnerInstallationTokenService implements OnModuleInit {
  private readonly tokenFilePath: string | undefined;
  private readonly readSecretFile: (filename: string, encoding: BufferEncoding) => Promise<string>;
  private readonly compare: DigestComparator;
  private digest: Buffer | null = null;

  constructor(options: RunnerInstallationTokenServiceOptions = {}) {
    this.tokenFilePath = options.tokenFilePath
      ?? options.environment?.KIDITEM_AGENT_RUNNER_TOKEN_FILE
      ?? process.env.KIDITEM_AGENT_RUNNER_TOKEN_FILE;
    this.readSecretFile = options.readFile ?? nodeReadFile;
    this.compare = options.timingSafeEqual ?? nodeTimingSafeEqual;
  }

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    if (!this.tokenFilePath?.trim()) throw new Error('runner_installation_token_file_required');
    const raw = (await this.readSecretFile(this.tokenFilePath, 'utf8')).trim();
    const bytes = decodeOpaqueBearer(raw);
    if (!bytes) throw new Error('runner_installation_token_invalid');
    this.digest = digest(bytes);
  }

  authenticate(candidate: string | undefined): boolean {
    if (!this.digest) return false;
    const bytes = typeof candidate === 'string' ? decodeOpaqueBearer(candidate) : null;
    if (!bytes) return false;
    const candidateDigest = digest(bytes);
    return candidateDigest.length === this.digest.length && this.compare(this.digest, candidateDigest);
  }
}

function decodeOpaqueBearer(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 32 && decoded.toString('base64url') === value ? decoded : null;
}

function digest(value: Buffer): Buffer {
  return createHash('sha256').update(value).digest();
}
