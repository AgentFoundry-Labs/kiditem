import { readdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { ProviderMessageSchema, type ProviderMessage } from '@kiditem/shared/agent-runtime';

const MAX_HISTORY_BYTES = 8 * 1024 * 1024;
const MAX_HISTORY_MESSAGES = 1_000;
const MAX_SCAN_ENTRIES = 2_000;
const MAX_TRACKED_TOOLS = 64;

type SessionArtifacts = Readonly<{
  transcripts: readonly string[];
  sidecarDirectories: readonly string[];
}>;

/** Owns bounded access to Claude's provider-native session artifacts. */
export class ClaudeProviderSessionStore {
  constructor(private readonly options: Readonly<{ loginRoot: string }>) {}

  async exists(sessionId: string): Promise<boolean> {
    if (!/^[a-zA-Z0-9-]{1,200}$/.test(sessionId)) return false;
    const artifacts = await findSessionArtifacts(this.options.loginRoot, sessionId);
    if (artifacts.transcripts.length > 1) throw new Error('claude_provider_session_ambiguous');
    return artifacts.transcripts.length === 1;
  }

  async read(sessionId: string): Promise<ProviderMessage[]> {
    if (!/^[a-zA-Z0-9-]{1,200}$/.test(sessionId)) throw new Error('claude_provider_history_unavailable');
    const artifacts = await findSessionArtifacts(this.options.loginRoot, sessionId);
    if (artifacts.transcripts.length !== 1) {
      if (artifacts.transcripts.length > 1) throw new Error('claude_provider_session_ambiguous');
      throw new Error('claude_provider_history_unavailable');
    }
    const path = artifacts.transcripts[0]!;
    let info;
    try { info = await stat(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('claude_provider_history_unavailable');
      throw new Error('claude_provider_history_io_failed');
    }
    if (!info.isFile() || info.size > MAX_HISTORY_BYTES) throw new Error('claude_provider_history_unavailable');
    let text: string;
    try { text = await readFile(path, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('claude_provider_history_unavailable');
      throw new Error('claude_provider_history_io_failed');
    }
    const messages: ProviderMessage[] = [];
    const toolNames = new Map<string, string>();
    for (const [index, line] of text.split('\n').entries()) {
      if (!line.trim()) continue;
      let record: Record<string, unknown>;
      try { record = JSON.parse(line) as Record<string, unknown>; } catch { throw new Error('claude_provider_history_unavailable'); }
      for (const message of toProviderMessages(record, index, toolNames)) {
        messages.push(message);
        if (messages.length > MAX_HISTORY_MESSAGES) messages.shift();
      }
    }
    return messages;
  }

  async remove(sessionId: string): Promise<void> {
    if (!/^[a-zA-Z0-9-]{1,200}$/.test(sessionId)) throw new Error('claude_provider_session_invalid');
    const artifacts = await findSessionArtifacts(this.options.loginRoot, sessionId);
    if (artifacts.transcripts.length > 1 || artifacts.sidecarDirectories.length > 1) {
      throw new Error('claude_provider_session_ambiguous');
    }
    const transcript = artifacts.transcripts[0];
    const sidecars = artifacts.sidecarDirectories[0];
    if (transcript && sidecars && dirname(transcript) !== dirname(sidecars)) {
      throw new Error('claude_provider_session_ambiguous');
    }
    try {
      if (transcript) await rm(transcript, { force: true });
      if (sidecars) await rm(sidecars, { recursive: true, force: true });
    } catch {
      throw new Error('claude_provider_session_delete_failed');
    }
  }
}

async function findSessionArtifacts(loginRoot: string, sessionId: string): Promise<SessionArtifacts> {
  const canonicalLoginRoot = await canonicalPathOrMissing(loginRoot);
  if (!canonicalLoginRoot) return emptyArtifacts();
  const canonicalRoot = await canonicalPathOrMissing(join(canonicalLoginRoot, '.claude', 'projects'));
  if (!canonicalRoot) return emptyArtifacts();
  if (!isWithin(canonicalRoot, canonicalLoginRoot)) throw new Error('claude_provider_history_path_invalid');
  const transcripts: string[] = [];
  const sidecarDirectories: string[] = [];
  let scanned = 0;
  async function scan(directory: string, depth: number): Promise<void> {
    if (depth > 5) return;
    const entries = await readDirectoryOrMissing(directory);
    if (!entries) return;
    for (const entry of entries) {
      scanned += 1;
      if (scanned > MAX_SCAN_ENTRIES) throw new Error('claude_provider_session_scan_limit');
      if (entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      const canonicalPath = await canonicalPathOrMissing(path);
      if (!canonicalPath) continue;
      if (!isWithin(canonicalPath, canonicalRoot)) throw new Error('claude_provider_history_path_invalid');
      if (entry.isFile() && entry.name === `${sessionId}.jsonl`) transcripts.push(canonicalPath);
      if (entry.isDirectory()) {
        if (entry.name === sessionId) sidecarDirectories.push(canonicalPath);
        await scan(canonicalPath, depth + 1);
      }
    }
  }
  await scan(canonicalRoot, 0);
  return { transcripts, sidecarDirectories };
}

function emptyArtifacts(): SessionArtifacts {
  return { transcripts: [], sidecarDirectories: [] };
}

async function canonicalPathOrMissing(path: string): Promise<string | null> {
  try { return await realpath(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('claude_provider_history_io_failed');
  }
}

async function readDirectoryOrMissing(path: string) {
  try { return await readdir(path, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('claude_provider_history_io_failed');
  }
}

function isWithin(candidate: string, root: string): boolean {
  const relation = relative(root, candidate);
  return relation === '' || (!isAbsolute(relation) && !relation.startsWith('..') && !relation.includes('/..') && !relation.includes('\\..'));
}

function toProviderMessages(record: Record<string, unknown>, index: number, toolNames: Map<string, string>): ProviderMessage[] {
  const role = record.type === 'user' ? 'user' : record.type === 'assistant' ? 'assistant' : null;
  if (!role) return [];
  const id = providerMessageId(record, index);
  const createdAt = createdAtFor(record);
  const messages: ProviderMessage[] = [];
  const content = contentText(object(record.message)?.content);
  if (content) messages.push(ProviderMessageSchema.parse({ id, role, content: content.slice(0, 16_000), createdAt }));
  const toolContent = object(record.message)?.content;
  if (!Array.isArray(toolContent)) return messages;
  for (const [toolIndex, raw] of toolContent.entries()) {
    const part = object(raw);
    if (role === 'assistant' && part?.type === 'tool_use') {
      const toolId = safeToolId(part.id);
      const name = safeToolName(part.name);
      if (!toolId || !name || toolNames.has(toolId) || toolNames.size >= MAX_TRACKED_TOOLS) continue;
      toolNames.set(toolId, name);
      messages.push(toolHistoryMessage(id, toolIndex, name, 'started', createdAt));
    }
    if (role === 'user' && part?.type === 'tool_result') {
      const toolId = safeToolId(part.tool_use_id);
      const name = toolId ? toolNames.get(toolId) : undefined;
      if (!toolId || !name) continue;
      toolNames.delete(toolId);
      messages.push(toolHistoryMessage(id, toolIndex, name, part.is_error === true ? 'failed' : 'completed', createdAt));
    }
  }
  return messages;
}

function providerMessageId(record: Record<string, unknown>, index: number): string {
  return typeof record.uuid === 'string' && record.uuid.trim() ? record.uuid.trim().slice(0, 180) : `claude-${index}`;
}

function createdAtFor(record: Record<string, unknown>): string {
  return typeof record.timestamp === 'string' && !Number.isNaN(Date.parse(record.timestamp))
    ? new Date(record.timestamp).toISOString()
    : new Date(0).toISOString();
}

function toolHistoryMessage(id: string, index: number, name: string, status: 'started' | 'completed' | 'failed', createdAt: string): ProviderMessage {
  return ProviderMessageSchema.parse({
    id: `${id}-tool-${index}`.slice(0, 200),
    role: 'tool',
    content: `${name}: ${status}`,
    createdAt,
  });
}

function contentText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return null;
  const parts = value.flatMap((item) => {
    const part = object(item);
    return part?.type === 'text' && typeof part.text === 'string' ? [part.text] : [];
  });
  return parts.length ? parts.join('\n') : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeToolId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_.:-]{1,200}$/.test(normalized) ? normalized : null;
}

function safeToolName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_.:-]{1,200}$/.test(normalized) ? normalized : null;
}
