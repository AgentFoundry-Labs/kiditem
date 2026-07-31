import { describe, expect, it } from 'vitest';
import { BrowserCollectionRunIdService } from '../browser-collection-run-id.service';

describe('BrowserCollectionRunIdService', () => {
  it('issues a server-side RFC 4122 UUID v4', () => {
    expect(new BrowserCollectionRunIdService().issue()).toEqual({
      runId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    });
  });
});
