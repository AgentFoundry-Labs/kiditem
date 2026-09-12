import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PATH_METADATA } from '@nestjs/common/constants';
import { SourcingExtensionIngestController } from '../adapter/in/http/sourcing-extension-ingest.controller';

describe('Sourcing product extension owner boundary', () => {
  it('does not expose an unused parallel v2 collection lifecycle', () => {
    const routes = Object.getOwnPropertyNames(SourcingExtensionIngestController.prototype)
      .map((name) => Reflect.getMetadata(PATH_METADATA,
        SourcingExtensionIngestController.prototype[name as keyof SourcingExtensionIngestController]));
    expect(routes).not.toContain('extension/v2/product-data');
    expect(routes).not.toContain('extension/v2/sessions');
  });
});
