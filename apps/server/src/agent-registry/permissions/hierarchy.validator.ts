/**
 * Permission Hierarchy Resolver — 5-layer permission resolution.
 *
 * Layers (lowest priority → highest):
 *   global → company → agentType → instance → runtime
 *
 * Rules:
 *   deniedSkills: UNION across all layers (deny accumulates)
 *   allowedTools: INTERSECTION across layers that specify it (most restrictive)
 *   permissionMode: last non-undefined layer wins
 */

export interface PermissionLayer {
  allowedTools?: string[];
  deniedSkills?: string[];
  permissionMode?: string;
}

export interface ResolvedPermissions {
  allowedTools: string[];
  deniedSkills: string[];
  permissionMode: string;
}

export function resolvePermissions(
  layers: PermissionLayer[],
  defaults: ResolvedPermissions,
): ResolvedPermissions {
  let allowedTools: string[] | null = null;
  const deniedSkills = new Set<string>();
  let permissionMode = defaults.permissionMode;

  for (const layer of layers) {
    // deniedSkills: union (accumulate)
    if (layer.deniedSkills?.length) {
      for (const skill of layer.deniedSkills) deniedSkills.add(skill);
    }

    // allowedTools: intersection (most restrictive)
    if (layer.allowedTools?.length) {
      if (allowedTools === null) {
        allowedTools = [...layer.allowedTools];
      } else {
        const layerSet = new Set(layer.allowedTools);
        allowedTools = allowedTools.filter(t => layerSet.has(t));
      }
    }

    // permissionMode: last non-undefined wins
    if (layer.permissionMode) {
      permissionMode = layer.permissionMode;
    }
  }

  return {
    allowedTools: allowedTools ?? defaults.allowedTools,
    deniedSkills: [...deniedSkills],
    permissionMode,
  };
}
