export interface ActiveTurn {
  conversationId: string;
  turnId: string;
}

export class ActiveTurnCapacityError extends Error {
  constructor() {
    super('gateway_turn_capacity_reached');
    this.name = 'ActiveTurnCapacityError';
  }
}

export class ActiveTurnNotFoundError extends Error {
  constructor() {
    super('gateway_turn_not_live');
    this.name = 'ActiveTurnNotFoundError';
  }
}

export class ActiveTurnAlreadyLiveError extends Error {
  constructor() {
    super('gateway_turn_already_live');
    this.name = 'ActiveTurnAlreadyLiveError';
  }
}

/** Four process-local parent-turn slots; deliberately no queue or persistence. */
export class ActiveTurnRegistry {
  private readonly active = new Map<string, ActiveTurn>();

  constructor(private readonly maximum = 4) {
    if (!Number.isInteger(maximum) || maximum < 1) throw new Error('gateway_turn_capacity_invalid');
  }

  get size(): number { return this.active.size; }

  admit(input: ActiveTurn): void {
    const key = turnKey(input);
    if (this.active.has(key) || [...this.active.values()].some((active) => active.conversationId === input.conversationId)) {
      throw new ActiveTurnAlreadyLiveError();
    }
    if (this.active.size >= this.maximum) throw new ActiveTurnCapacityError();
    this.active.set(key, Object.freeze({ ...input }));
  }

  require(input: ActiveTurn): ActiveTurn {
    const active = this.active.get(turnKey(input));
    if (!active) throw new ActiveTurnNotFoundError();
    return active;
  }

  hasConversation(conversationId: string): boolean {
    return [...this.active.values()].some((active) => active.conversationId === conversationId);
  }

  /** Terminal/interrupt release is idempotent so duplicate provider events are harmless. */
  release(input: ActiveTurn): boolean {
    return this.active.delete(turnKey(input));
  }

  /** Gateway disconnect/restart removes every in-memory active slot. */
  clear(): ActiveTurn[] {
    const active = [...this.active.values()];
    this.active.clear();
    return active;
  }
}

function turnKey(input: ActiveTurn): string {
  return `${input.conversationId}\u0000${input.turnId}`;
}
