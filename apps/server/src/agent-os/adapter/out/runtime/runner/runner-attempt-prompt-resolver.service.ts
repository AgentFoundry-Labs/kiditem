import { lstat, readFile, realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { AttemptPromptResolver } from './host-runner-attempt-executor.service';

/** Resolves only immutable repository instruction profiles, never an Attempt workspace. */
export class RunnerAttemptPromptResolverService implements AttemptPromptResolver {
  async resolve(input: { reference?: string; prompt: string }): Promise<string> {
    const prompt = input.prompt.trim();
    if (!prompt || prompt.length > 24_000) throw new Error('attempt_prompt_invalid');
    if (!input.reference) return prompt;
    const filename = await resolveInstructionProfilePath(input.reference);
    const profile = await readFile(filename, 'utf8');
    if (!profile.trim() || Buffer.byteLength(profile, 'utf8') > 12_000) throw new Error('attempt_instruction_profile_invalid');
    return `${profile.trim()}\n\n# Current durable work\n${prompt}`.slice(0, 24_000);
  }
}

async function resolveInstructionProfilePath(reference: string, cwd = process.cwd()): Promise<string> {
  if (!/^agent-config\/prompts\/agents\/[a-z_]+\.md$/.test(reference)) throw new Error('attempt_instruction_profile_invalid');
  for (const root of [resolve(cwd), resolve(cwd, '../..')]) {
    const filename = resolve(root, reference);
    if (relative(root, filename).startsWith('..')) continue;
    const info = await lstat(filename).catch(() => null);
    if (!info || info.isSymbolicLink() || !info.isFile()) continue;
    const realRoot = await realpath(root).catch(() => null);
    const realFile = await realpath(filename).catch(() => null);
    if (!realRoot || !realFile || relative(realRoot, realFile).startsWith('..')) continue;
    return realFile;
  }
  throw new Error('attempt_instruction_profile_missing');
}
