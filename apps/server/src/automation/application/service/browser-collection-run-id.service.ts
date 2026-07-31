import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  BrowserCollectionRunIssueResponseSchema,
  type BrowserCollectionRunIssueResponse,
} from '@kiditem/shared/browser-collection-session';

@Injectable()
export class BrowserCollectionRunIdService {
  issue(): BrowserCollectionRunIssueResponse {
    return BrowserCollectionRunIssueResponseSchema.parse({
      runId: randomUUID(),
    });
  }
}
