import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const interactionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const providerFile = join(interactionRoot, 'ConversationProvider.tsx');

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : productionSources(entryPath);
    return ['.ts', '.tsx'].includes(extname(entry.name)) && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.spec.tsx')
      ? [entryPath]
      : [];
  });
}

describe('Agent interaction CopilotKit boundary', () => {
  it('keeps run ownership and runtime protocol access inside the CopilotKit public interface', () => {
    const sources = productionSources(interactionRoot);
    const violations = sources.flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8');
      const relativePath = relative(interactionRoot, filePath);
      const findings: string[] = [];
      if (/(?:^|[^\w$.])agent\.runAgent\s*\(/m.test(source)) findings.push('agent.runAgent');
      if (/(?:^|[^\w$.])agent\.abortRun\s*\(/m.test(source)) findings.push('agent.abortRun');
      if (filePath !== providerFile && /['"]\/api\/copilotkit(?:['"]|\/)/.test(source)) {
        findings.push('raw /api/copilotkit transport');
      }
      if (/\bmethod\s*:\s*['"](?:info|agent\/(?:run|connect|stop|isRunning))['"]/.test(source)) {
        findings.push('raw CopilotKit protocol envelope');
      }
      return findings.map((finding) => `${relativePath}: ${finding}`);
    });

    expect(violations).toEqual([]);
  });
});
