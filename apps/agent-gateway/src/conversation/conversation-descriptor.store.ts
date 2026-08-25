import { randomUUID } from 'node:crypto';
import {
  chmod as nodeChmod,
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  rename as nodeRename,
  unlink as nodeUnlink,
  writeFile as nodeWriteFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { ConversationDescriptorSchema, type ConversationDescriptor } from './conversation-descriptor';

const MAX_DESCRIPTORS = 1_000;
const DESCRIPTOR_FILE = 'conversations.json';

export interface ConversationDescriptorFilesystem {
  mkdir(path: string, options: Readonly<{ recursive: true; mode: number }>): Promise<unknown>;
  chmod(path: string, mode: number): Promise<unknown>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, value: string, options: Readonly<{ encoding: 'utf8'; mode: number; flag: 'wx' }>): Promise<unknown>;
  rename(from: string, to: string): Promise<unknown>;
  unlink(path: string): Promise<unknown>;
}

const filesystem: ConversationDescriptorFilesystem = {
  mkdir: (path, options) => nodeMkdir(path, options),
  chmod: (path, mode) => nodeChmod(path, mode),
  readFile: (path, encoding) => nodeReadFile(path, encoding),
  writeFile: (path, value, options) => nodeWriteFile(path, value, options),
  rename: (from, to) => nodeRename(from, to),
  unlink: (path) => nodeUnlink(path),
};

/** Atomic, bounded local catalog; it is deliberately not a transcript store. */
export class ConversationDescriptorStore {
  private readonly stateFile: string;
  private readonly storage: ConversationDescriptorFilesystem;
  private readonly random: () => string;

  constructor(private readonly options: Readonly<{
    stateRoot: string;
    platform: 'macos' | 'windows';
    filesystem?: ConversationDescriptorFilesystem;
    randomUuid?: () => string;
  }>) {
    this.stateFile = join(options.stateRoot, DESCRIPTOR_FILE);
    this.storage = options.filesystem ?? filesystem;
    this.random = options.randomUuid ?? randomUUID;
  }

  async list(): Promise<ConversationDescriptor[]> {
    let raw: string;
    try {
      raw = await this.storage.readFile(this.stateFile, 'utf8');
    } catch (error) {
      if (isNotFound(error)) return [];
      throw new Error('gateway_descriptor_read_failed');
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('gateway_descriptor_invalid');
    }
    return parseCollection(value);
  }

  async find(id: string): Promise<ConversationDescriptor | null> {
    return (await this.list()).find((descriptor) => descriptor.id === id) ?? null;
  }

  async create(input: ConversationDescriptor): Promise<void> {
    const descriptor = parseDescriptor(input);
    const current = await this.list();
    if (current.some((candidate) => candidate.id === descriptor.id)) {
      throw new Error('gateway_descriptor_duplicate');
    }
    await this.replace([...current, descriptor]);
  }

  async replace(input: readonly ConversationDescriptor[]): Promise<void> {
    const descriptors = parseCollection(input);
    await this.writeAtomically(descriptors);
  }

  async remove(id: string): Promise<void> {
    const current = await this.list();
    const next = current.filter((descriptor) => descriptor.id !== id);
    if (next.length === current.length) throw new Error('gateway_descriptor_not_found');
    await this.replace(next);
  }

  private async writeAtomically(descriptors: readonly ConversationDescriptor[]): Promise<void> {
    const temporary = join(this.options.stateRoot, `.${DESCRIPTOR_FILE}.${this.random()}.tmp`);
    try {
      await this.storage.mkdir(this.options.stateRoot, { recursive: true, mode: 0o700 });
      if (this.options.platform === 'macos') await this.storage.chmod(this.options.stateRoot, 0o700);
      await this.storage.writeFile(temporary, JSON.stringify(descriptors), {
        encoding: 'utf8', mode: 0o600, flag: 'wx',
      });
      if (this.options.platform === 'macos') await this.storage.chmod(temporary, 0o600);
      await this.storage.rename(temporary, this.stateFile);
      if (this.options.platform === 'macos') await this.storage.chmod(this.stateFile, 0o600);
    } catch {
      try { await this.storage.unlink(temporary); } catch { /* no temporary file to remove */ }
      throw new Error('gateway_descriptor_write_failed');
    }
  }
}

function parseDescriptor(value: unknown): ConversationDescriptor {
  const parsed = ConversationDescriptorSchema.safeParse(value);
  if (!parsed.success) throw new Error('gateway_descriptor_invalid');
  return parsed.data;
}

function parseCollection(value: unknown): ConversationDescriptor[] {
  if (!Array.isArray(value)) throw new Error('gateway_descriptor_invalid');
  if (value.length > MAX_DESCRIPTORS) throw new Error('gateway_descriptor_limit');
  const descriptors = value.map(parseDescriptor);
  const ids = new Set<string>();
  for (const descriptor of descriptors) {
    if (ids.has(descriptor.id)) throw new Error('gateway_descriptor_duplicate');
    ids.add(descriptor.id);
  }
  return descriptors;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
