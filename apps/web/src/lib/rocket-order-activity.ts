export type RocketOrderActivityStatus = 'started' | 'succeeded' | 'failed';

export interface RocketOrderActivityInput {
  status: RocketOrderActivityStatus;
  message: string;
}

export interface RocketOrderActivityEvent extends RocketOrderActivityInput {
  id: string;
  occurredAt: string;
}
