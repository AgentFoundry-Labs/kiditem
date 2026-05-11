import type { CSSProperties } from 'react';

const BORDER = '1px solid var(--border-subtle)';

export const cardRaised: CSSProperties = {
  background: 'var(--card-bg)',
  boxShadow: 'var(--shadow-md)',
  border: BORDER,
};

export const cardFlat: CSSProperties = {
  background: 'var(--card-bg)',
  boxShadow: 'var(--shadow-sm)',
  border: BORDER,
};

export const cardPlain: CSSProperties = {
  background: 'var(--card-bg)',
  border: BORDER,
};
