import { readdir, realpath, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';

const MAX_SCAN_ENTRIES = 2_000;

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
