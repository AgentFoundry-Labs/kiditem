import { describe, it, expect, vi } from 'vitest';
import { TranscriptService, TRANSCRIPT_EVENT } from '../transcript.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('TranscriptService', () => {
  it('exports TRANSCRIPT_EVENT constant', () => {
    expect(TRANSCRIPT_EVENT).toBe('agent.run.transcript');
  });
});
