export type ChannelErrorKind = 'invalid' | 'not_found' | 'conflict' | 'unsupported' | 'unavailable' | 'forbidden';
export class ChannelBusinessError extends Error {
  readonly details: Record<string, unknown>;
  constructor(readonly kind: ChannelErrorKind, problem: string | Record<string, unknown>) {
    super(typeof problem === 'string' ? problem : typeof problem.message === 'string' ? problem.message : kind);
    this.name = 'ChannelBusinessError';
    this.details = typeof problem === 'string' ? {} : problem;
  }
}
export class ChannelInputError extends ChannelBusinessError {
  constructor(problem: string | Record<string, unknown>) { super('invalid', problem); }
}
export class ChannelNotFoundError extends ChannelBusinessError {
  constructor(problem: string | Record<string, unknown>) { super('not_found', problem); }
}
export class ChannelConflictError extends ChannelBusinessError {
  constructor(problem: string | Record<string, unknown>) { super('conflict', problem); }
}
export class ChannelUnsupportedError extends ChannelBusinessError {
  constructor(problem: string | Record<string, unknown>) { super('unsupported', problem); }
}
export class ChannelUnavailableError extends ChannelBusinessError {
  constructor(problem: string | Record<string, unknown>) { super('unavailable', problem); }
}
export class ChannelForbiddenError extends ChannelBusinessError {
  constructor(problem: string | Record<string, unknown>) { super('forbidden', problem); }
}
