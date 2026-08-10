import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SellochSourcingPage } from './SellochSourcingPage';

describe('SellochSourcingPage table markup', () => {
  it('groups validation rows in a tbody so browser DOM repair cannot cause hydration errors', () => {
    const markup = renderToStaticMarkup(<SellochSourcingPage kind="validation" />);

    expect(markup).toMatch(/<table[^>]*>\s*<tbody>/);
    expect(markup).not.toMatch(/<table[^>]*>\s*<tr/);
  });
});
