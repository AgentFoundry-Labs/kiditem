import { describe, expect, it } from 'vitest';
import { sourcingProductExtensionCollector } from './index';

describe('sourcing.product_extension collector (KID-360)', () => {
  it('yields one product_document with the extracted document', async () => {
    const chunks = [];
    const document = { product: { source_url: 'https://detail.1688.com/offer/1.html', title: 'a' }, hadDescription: false };
    for await (const chunk of sourcingProductExtensionCollector.collect({ sourceUrl: 'https://detail.1688.com/offer/1.html' }, {
      extract: async () => document,
    }, { signal: new AbortController().signal, tabId: null })) chunks.push(chunk);
    expect(chunks).toEqual([{ chunkKind: 'product_document', payload: [document], progress: { current: 1, total: 1, label: '상품' } }]);
  });
});
