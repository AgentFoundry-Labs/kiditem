import { describe, it, expect } from 'vitest';
import { classifyToolRequest, filterTools } from '../permissions/classifier';
import type { ResolvedPermissions } from '../permissions/hierarchy.validator';

function makeResolved(overrides: Partial<ResolvedPermissions> = {}): ResolvedPermissions {
  return {
    allowedTools: [],
    deniedSkills: [],
    permissionMode: 'default',
    ...overrides,
  };
}

describe('classifyToolRequest', () => {
  it('tool in allowedTools → allow', () => {
    const resolved = makeResolved({ allowedTools: ['Read', 'Grep', 'Bash'] });
    expect(classifyToolRequest('Read', resolved)).toBe('allow');
    expect(classifyToolRequest('Grep', resolved)).toBe('allow');
  });

  it('tool in deniedSkills → deny', () => {
    const resolved = makeResolved({ allowedTools: ['Read', 'Bash'], deniedSkills: ['Bash'] });
    expect(classifyToolRequest('Bash', resolved)).toBe('deny');
  });

  it('deny takes priority over allow (tool in both lists → deny)', () => {
    const resolved = makeResolved({
      allowedTools: ['Read', 'Bash'],
      deniedSkills: ['Read'],
    });
    expect(classifyToolRequest('Read', resolved)).toBe('deny');
  });

  it('wildcard deny (e.g. Bash(rm:*)) matches Bash(rm:/)', () => {
    const resolved = makeResolved({ deniedSkills: ['Bash(rm:'] });
    expect(classifyToolRequest('Bash(rm:/)', resolved)).toBe('deny');
    expect(classifyToolRequest('Bash(rm:/etc)', resolved)).toBe('deny');
  });

  it('deny wildcard * matches everything', () => {
    const resolved = makeResolved({ deniedSkills: ['*'] });
    expect(classifyToolRequest('Read', resolved)).toBe('deny');
    expect(classifyToolRequest('Bash', resolved)).toBe('deny');
  });

  it('unknown tool with non-empty allowedTools → deny (not in whitelist)', () => {
    const resolved = makeResolved({ allowedTools: ['Read', 'Grep'] });
    expect(classifyToolRequest('Bash', resolved)).toBe('deny');
    expect(classifyToolRequest('Write', resolved)).toBe('deny');
  });

  it('unknown tool with empty allowedTools → allow (permissive default)', () => {
    const resolved = makeResolved({ allowedTools: [] });
    expect(classifyToolRequest('SomeTool', resolved)).toBe('allow');
    expect(classifyToolRequest('AnyUnknownTool', resolved)).toBe('allow');
  });

  it('wildcard allowedTools (e.g. Bash(*)) matches any Bash invocation', () => {
    const resolved = makeResolved({ allowedTools: ['Bash*'] });
    expect(classifyToolRequest('Bash(psql:*)', resolved)).toBe('allow');
    expect(classifyToolRequest('Bash', resolved)).toBe('allow');
  });

  it('tool matching by prefix with parenthesis (Bash → Bash(...))', () => {
    const resolved = makeResolved({ allowedTools: ['Bash', 'Read'] });
    expect(classifyToolRequest('Bash(psql:some/path)', resolved)).toBe('allow');
    expect(classifyToolRequest('Read', resolved)).toBe('allow');
  });

  it('partial prefix match does not false-positive', () => {
    const resolved = makeResolved({ allowedTools: ['Read'] });
    // 'ReadFile' does not start with 'Read(' and is not equal to 'Read'
    // Actually per spec: tool === a || tool.startsWith(a + '(')
    // 'ReadFile' !== 'Read' and does not start with 'Read(' → deny
    expect(classifyToolRequest('ReadFile', resolved)).toBe('deny');
  });
});

describe('filterTools', () => {
  it('filters out denied tools', () => {
    const resolved = makeResolved({
      allowedTools: ['Read', 'Bash', 'Grep'],
      deniedSkills: ['Bash'],
    });
    const result = filterTools(['Read', 'Bash', 'Grep'], resolved);
    expect(result).toEqual(['Read', 'Grep']);
  });

  it('returns all tools when no restrictions', () => {
    const resolved = makeResolved();
    const tools = ['Read', 'Write', 'Bash'];
    expect(filterTools(tools, resolved)).toEqual(tools);
  });

  it('returns empty array when all tools denied', () => {
    const resolved = makeResolved({ deniedSkills: ['*'] });
    expect(filterTools(['Read', 'Bash'], resolved)).toEqual([]);
  });
});
