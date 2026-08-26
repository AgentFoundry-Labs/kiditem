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
import {
  ConversationPreferencesSchema,
  SetConversationPreferenceCommandSchema,
  type ConversationPreferences,
  type SetConversationPreferenceCommand,
} from '@kiditem/shared/agent-runtime';

const PREFERENCE_FILE = 'conversation-preferences.json';

export interface ConversationPreferenceFilesystem {
  mkdir(path: string, options: Readonly<{ recursive: true; mode: number }>): Promise<unknown>;
  chmod(path: string, mode: number): Promise<unknown>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, value: string, options: Readonly<{ encoding: 'utf8'; mode: number; flag: 'wx' }>): Promise<unknown>;
  rename(from: string, to: string): Promise<unknown>;
  unlink(path: string): Promise<unknown>;
}

const filesystem: ConversationPreferenceFilesystem = {
  mkdir: (path, options) => nodeMkdir(path, options),
  chmod: (path, mode) => nodeChmod(path, mode),
  readFile: (path, encoding) => nodeReadFile(path, encoding),
  writeFile: (path, value, options) => nodeWriteFile(path, value, options),
  rename: (from, to) => nodeRename(from, to),
  unlink: (path) => nodeUnlink(path),
};

/** Private installation-local defaults; this file deliberately has no identity or provider state. */
export class ConversationPreferenceStore {
  private readonly stateFile: string;
  private readonly storage: ConversationPreferenceFilesystem;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: Readonly<{
    stateRoot: string;
    platform: 'macos' | 'windows';
    filesystem?: ConversationPreferenceFilesystem;
  }>) {
    this.stateFile = join(options.stateRoot, PREFERENCE_FILE);
    this.storage = options.filesystem ?? filesystem;
  }

  async read(): Promise<ConversationPreferences> {
    const pending = this.mutationTail;
    await pending;
    return this.readDocument();
  }

  async set(input: SetConversationPreferenceCommand): Promise<ConversationPreferences> {
    return this.enqueueMutation(async () => {
      const command = SetConversationPreferenceCommandSchema.parse(input);
      const current = await this.readDocument();
      const contexts = {
        ...current.contexts,
        [command.context]: {
          ...current.contexts[command.context],
          [command.runtime]: {
            model: command.model,
            reasoningEffort: command.reasoningEffort,
          },
        },
      };
      const next = parsePreferences({ schemaVersion: 1, contexts });
      await this.writeAtomically(next);
      return next;
    });
  }

  private enqueueMutation<T>(work: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(work, work);
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readDocument(): Promise<ConversationPreferences> {
    let raw: string;
    try {
      raw = await this.storage.readFile(this.stateFile, 'utf8');
    } catch (error) {
      if (isNotFound(error)) return { schemaVersion: 1, contexts: {} };
      throw new Error('gateway_conversation_preferences_read_failed');
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('gateway_conversation_preferences_invalid');
    }
    return parsePreferences(value);
  }

  private async writeAtomically(preferences: ConversationPreferences): Promise<void> {
    const temporary = join(this.options.stateRoot, `.${PREFERENCE_FILE}.${randomUUID()}.tmp`);
    try {
      await this.storage.mkdir(this.options.stateRoot, { recursive: true, mode: 0o700 });
      if (this.options.platform === 'macos') await this.storage.chmod(this.options.stateRoot, 0o700);
      await this.storage.writeFile(temporary, JSON.stringify(preferences), {
        encoding: 'utf8', mode: 0o600, flag: 'wx',
      });
      if (this.options.platform === 'macos') await this.storage.chmod(temporary, 0o600);
      await this.storage.rename(temporary, this.stateFile);
    } catch {
      try { await this.storage.unlink(temporary); } catch { /* no temporary file to remove */ }
      throw new Error('gateway_conversation_preferences_write_failed');
    }
  }
}

function parsePreferences(value: unknown): ConversationPreferences {
  const parsed = ConversationPreferencesSchema.safeParse(value);
  if (!parsed.success) throw new Error('gateway_conversation_preferences_invalid');
  return parsed.data;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
