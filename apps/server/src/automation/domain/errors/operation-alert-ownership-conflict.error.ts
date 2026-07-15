export class OperationAlertOwnershipConflictError extends Error {
  constructor() {
    super('operation alert belongs to another actor');
    this.name = 'OperationAlertOwnershipConflictError';
  }
}
