import { describe, it, expect } from 'vitest';
import { validateAllowedTools } from '../dangerous-patterns';

describe('validateAllowedTools', () => {
  it('passes safe tool patterns', () => {
    const result = validateAllowedTools('Read Grep');
    expect(result.valid).toBe(true);
    expect(result.blocked).toEqual([]);
  });

  it('blocks direct database shells', () => {
    const result = validateAllowedTools('Bash(psql:*) Read');
    expect(result.valid).toBe(false);
    expect(result.blocked).toEqual(['Bash(psql:*)']);
  });

  it('blocks dangerous patterns', () => {
    const result = validateAllowedTools('Bash(rm:*) Read');
    expect(result.valid).toBe(false);
    expect(result.blocked).toEqual(['Bash(rm:*)']);
  });

  it('blocks multiple dangerous patterns', () => {
    const result = validateAllowedTools('python:* Bash(sudo:*) Read');
    expect(result.valid).toBe(false);
    expect(result.blocked).toHaveLength(2);
  });

  it('blocks wildcard Bash', () => {
    const result = validateAllowedTools('Bash(*)');
    expect(result.valid).toBe(false);
  });

  it('handles empty string', () => {
    const result = validateAllowedTools('');
    expect(result.valid).toBe(true);
  });
});
