export class AgentOsError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AgentOsError';
  }
}

export class AgentOsCatalogError extends AgentOsError {
  constructor(code: string, message?: string) {
    super(code, message);
    this.name = 'AgentOsCatalogError';
  }
}

export class AgentOsBoundaryError extends AgentOsError {
  constructor(code: string, message?: string) {
    super(code, message);
    this.name = 'AgentOsBoundaryError';
  }
}

export class AgentOsRuntimeError extends AgentOsError {
  constructor(code: string, message?: string) {
    super(code, message);
    this.name = 'AgentOsRuntimeError';
  }
}

export function normalizeAgentErrorCode(error: unknown): string {
  if (error instanceof AgentOsError) {
    return error.code;
  }
  if (error instanceof Error) {
    return error.name === 'AbortError' ? 'aborted' : 'runtime_error';
  }
  return 'runtime_error';
}

export function normalizeAgentErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'unknown error';
  }
}
