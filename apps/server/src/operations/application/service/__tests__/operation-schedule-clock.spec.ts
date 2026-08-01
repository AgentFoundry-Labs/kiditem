import { describe, expect, it } from 'vitest';
import { nextOccurrence } from '../operation-schedule-clock';

describe('nextOccurrence', () => {
  it('calculates a five-field cron occurrence in the configured timezone', () => {
    expect(
      nextOccurrence(
        '0 6 * * *',
        'Asia/Seoul',
        new Date('2026-08-01T00:00:00Z'),
      ).toISOString(),
    ).toBe('2026-08-01T21:00:00.000Z');
  });

  it('rejects unknown IANA timezones and six-field expressions', () => {
    expect(() => nextOccurrence('0 6 * * *', 'Mars/Olympus', new Date())).toThrow(
      'invalid_timezone',
    );
    expect(() => nextOccurrence('0 0 6 * * *', 'Asia/Seoul', new Date())).toThrow(
      'invalid_cron_expression',
    );
  });
});
