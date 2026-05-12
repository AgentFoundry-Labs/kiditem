/**
 * Shared CLI argument parser for repo scripts. Three callers (`dev-data.ts`,
 * `dev-data-coupang.ts`, `staging-db-baseline.ts`) used to inline the same
 * argv → `{ command, values, flags }` parser plus the same `value` /
 * `values` / `bool` / `requiredValue` accessors. This module is the single
 * source of truth.
 *
 * Type-blind on purpose: each caller passes the command union it accepts and
 * the default command. The command validation stays at the caller so that
 * dev-data's `Command` type and staging-db-baseline's `Command` type can
 * stay narrow and explicit at the call site.
 */

export interface ParsedArgs<C extends string = string> {
  command: C;
  values: Map<string, string[]>;
  flags: Set<string>;
}

export interface ParseRawArgsOptions<C extends string> {
  /**
   * Allowed command verbs. The first positional argv element must match one
   * of these; otherwise `parseRawArgs` throws.
   */
  commands: readonly C[];
  /**
   * Fallback command when argv is empty (e.g. user runs `dev-data` without
   * any arguments).
   */
  defaultCommand: C;
}

export function parseRawArgs<C extends string>(
  argv: string[],
  options: ParseRawArgsOptions<C>,
): ParsedArgs<C> {
  const { commands, defaultCommand } = options;
  const tokens = [...argv];
  const command = (tokens.shift() ?? defaultCommand) as C;
  if (!commands.includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const stripped = token.slice(2);
    const eq = stripped.indexOf('=');
    if (eq >= 0) {
      pushValue(values, stripped.slice(0, eq), stripped.slice(eq + 1));
      continue;
    }
    const next = tokens[i + 1];
    if (!next || next.startsWith('--')) {
      flags.add(stripped);
      continue;
    }
    pushValue(values, stripped, next);
    i += 1;
  }

  return { command, values, flags };
}

export function pushValue(values: Map<string, string[]>, key: string, item: string): void {
  values.set(key, [...(values.get(key) ?? []), item]);
}

export function value(args: ParsedArgs, key: string): string | undefined {
  return args.values.get(key)?.at(-1);
}

export function values(args: ParsedArgs, key: string): string[] {
  return args.values.get(key) ?? [];
}

export function bool(args: ParsedArgs, key: string): boolean {
  return args.flags.has(key) || value(args, key) === 'true';
}

/**
 * Resolve `--key value` from argv, falling back to `process.env[envName]`
 * when provided. Throws when neither source supplies a value — used by
 * scripts that need an unambiguous required input.
 */
export function requiredValue(args: ParsedArgs, key: string, envName?: string): string {
  const fromArgs = value(args, key);
  const fromEnv = envName ? process.env[envName] : undefined;
  const resolved = fromArgs ?? fromEnv;
  if (!resolved) {
    throw new Error(`Missing --${key}${envName ? ` or ${envName}` : ''}`);
  }
  return resolved;
}
