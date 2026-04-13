import type { ResolvedPermissions } from './hierarchy.validator';

/**
 * Smart tool classifier — rule-based (v1, no LLM).
 *
 * safeTools → instant allow
 * deniedSkills → instant deny
 * unknown → allow (permissive default in v1)
 */
export function classifyToolRequest(
  tool: string,
  resolved: ResolvedPermissions,
): 'allow' | 'deny' {
  // Check denied first (deny wins over allow)
  if (resolved.deniedSkills.some(d => tool.startsWith(d) || d === '*')) {
    return 'deny';
  }

  // Check allowed (if allowedTools is specified, tool must be in it)
  if (resolved.allowedTools.length > 0) {
    const allowed = resolved.allowedTools.some(a => {
      if (a.includes('*')) {
        const prefix = a.replace('*', '');
        return tool.startsWith(prefix);
      }
      return tool === a || tool.startsWith(a + '(');
    });
    if (!allowed) return 'deny';
  }

  return 'allow';
}

/**
 * Filter a list of tools through the classifier.
 */
export function filterTools(
  tools: string[],
  resolved: ResolvedPermissions,
): string[] {
  return tools.filter(t => classifyToolRequest(t, resolved) === 'allow');
}
