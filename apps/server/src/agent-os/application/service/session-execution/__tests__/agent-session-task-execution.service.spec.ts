import { describe, expect, it } from 'vitest';
import { AgentSessionTaskExecutionService } from '../agent-session-task-execution.service';

describe('AgentSessionTaskExecutionService', () => {
  it('is the durable session-task execution use case', () => {
    expect(AgentSessionTaskExecutionService).toBeTypeOf('function');
  });
});
