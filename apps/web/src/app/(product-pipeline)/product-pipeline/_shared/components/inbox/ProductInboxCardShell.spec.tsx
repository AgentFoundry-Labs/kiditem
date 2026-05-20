import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductInboxCardShell } from './ProductInboxCardShell';

describe('ProductInboxCardShell', () => {
  it('keeps the dynamic thumbnail inside a fixed square slot', () => {
    render(
      <ProductInboxCardShell
        title="키즈 자석 다트"
        thumbnailUrl="https://example.com/wide-image.jpg"
      />,
    );

    const imageSlot = screen.getByAltText('키즈 자석 다트').parentElement;

    expect(imageSlot).toHaveClass('aspect-square');
    expect(imageSlot).toHaveClass('w-full');
    expect(imageSlot).toHaveClass('shrink-0');
    expect(screen.getByAltText('키즈 자석 다트')).toHaveClass('object-cover');
  });
});
