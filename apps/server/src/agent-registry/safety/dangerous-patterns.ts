const BLOCKED_PATTERNS = [
  /^python:\*$/,
  /^Bash\(psql:/,
  /^Bash\(rm:/,
  /^Bash\(sudo:/,
  /^Bash\(kill:/,
  /^Bash\(chmod:/,
  /^Bash\(chown:/,
  /^node:\*$/,
  /^Bash\(\*\)$/,
];

export function validateAllowedTools(tools: string): { valid: boolean; blocked: string[] } {
  const toolList = tools.split(/\s+/).filter(Boolean);
  const blocked = toolList.filter(t => BLOCKED_PATTERNS.some(p => p.test(t)));
  return { valid: blocked.length === 0, blocked };
}
