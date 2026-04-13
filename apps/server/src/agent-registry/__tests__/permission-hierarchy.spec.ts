import { describe, it, expect } from 'vitest';
import { resolvePermissions } from '../permissions/hierarchy.validator';
import type { PermissionLayer, ResolvedPermissions } from '../permissions/hierarchy.validator';

const DEFAULTS: ResolvedPermissions = {
  allowedTools: ['Bash', 'Read'],
  deniedSkills: [],
  permissionMode: 'default',
};

describe('resolvePermissions', () => {
  it('empty layers → returns defaults', () => {
    const result = resolvePermissions([], DEFAULTS);
    expect(result).toEqual(DEFAULTS);
  });

  it('single layer with allowedTools → uses that layer tools', () => {
    const layers: PermissionLayer[] = [{ allowedTools: ['Read', 'Write'] }];
    const result = resolvePermissions(layers, DEFAULTS);
    expect(result.allowedTools).toEqual(['Read', 'Write']);
    expect(result.deniedSkills).toEqual([]);
    expect(result.permissionMode).toBe('default');
  });

  it('two layers with different allowedTools → intersection', () => {
    const layers: PermissionLayer[] = [
      { allowedTools: ['Bash', 'Read', 'Write'] },
      { allowedTools: ['Read', 'Write', 'Edit'] },
    ];
    const result = resolvePermissions(layers, DEFAULTS);
    expect(result.allowedTools).toEqual(['Read', 'Write']);
  });

  it('multiple layers with deniedSkills → union', () => {
    const layers: PermissionLayer[] = [
      { deniedSkills: ['skill-a', 'skill-b'] },
      { deniedSkills: ['skill-b', 'skill-c'] },
    ];
    const result = resolvePermissions(layers, DEFAULTS);
    expect(result.deniedSkills).toContain('skill-a');
    expect(result.deniedSkills).toContain('skill-b');
    expect(result.deniedSkills).toContain('skill-c');
    expect(result.deniedSkills).toHaveLength(3);
  });

  it('permissionMode: last non-undefined wins', () => {
    const layers: PermissionLayer[] = [
      { permissionMode: 'first' },
      { permissionMode: 'second' },
      {},
      { permissionMode: 'last' },
    ];
    const result = resolvePermissions(layers, DEFAULTS);
    expect(result.permissionMode).toBe('last');
  });

  it('mixed: only layers WITH allowedTools participate in intersection', () => {
    const layers: PermissionLayer[] = [
      { allowedTools: ['Bash', 'Read', 'Write'] },
      { deniedSkills: ['some-skill'] }, // no allowedTools → skipped in intersection
      { allowedTools: ['Read', 'Write'] },
    ];
    const result = resolvePermissions(layers, DEFAULTS);
    // intersection of ['Bash','Read','Write'] and ['Read','Write'] = ['Read','Write']
    expect(result.allowedTools).toEqual(['Read', 'Write']);
  });

  it('backward compatible: single instance layer = same as current behavior', () => {
    const instanceTools = ['Bash(psql:*)', 'Read'];
    const layers: PermissionLayer[] = [
      {
        allowedTools: instanceTools,
        deniedSkills: [],
        permissionMode: 'bypassPermissions',
      },
    ];
    const result = resolvePermissions(layers, {
      allowedTools: instanceTools,
      deniedSkills: [],
      permissionMode: 'bypassPermissions',
    });
    expect(result.allowedTools).toEqual(instanceTools);
    expect(result.deniedSkills).toEqual([]);
    expect(result.permissionMode).toBe('bypassPermissions');
  });

  it('intersection with non-overlapping tools → empty array', () => {
    const layers: PermissionLayer[] = [
      { allowedTools: ['Bash'] },
      { allowedTools: ['Read'] },
    ];
    const result = resolvePermissions(layers, DEFAULTS);
    expect(result.allowedTools).toEqual([]);
  });

  it('deniedSkills accumulates from all layers without duplicates', () => {
    const layers: PermissionLayer[] = [
      { deniedSkills: ['dup', 'unique-a'] },
      { deniedSkills: ['dup', 'unique-b'] },
    ];
    const result = resolvePermissions(layers, DEFAULTS);
    const dupCount = result.deniedSkills.filter(s => s === 'dup').length;
    expect(dupCount).toBe(1);
    expect(result.deniedSkills).toHaveLength(3);
  });
});
