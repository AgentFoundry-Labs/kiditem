import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OperationReferenceCard } from '../OperationReferenceCard';
import { ResourceReferenceCard } from '../ResourceReferenceCard';

describe('Agent result reference cards', () => {
  it('renders only the allowlisted operation reference fields', () => {
    render(<OperationReferenceCard reference={{ kind: 'operation_run', id: 'operation-123' }} />);

    expect(screen.getByText('Operation reference')).toBeVisible();
    expect(screen.getByText('operation_run')).toBeVisible();
    expect(screen.getByText('operation-123')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders only the allowlisted resource reference fields', () => {
    render(<ResourceReferenceCard reference={{ kind: 'sourcing_candidate', id: 'candidate-123', version: 'v7' }} />);

    expect(screen.getByText('Resource reference')).toBeVisible();
    expect(screen.getByText('sourcing_candidate')).toBeVisible();
    expect(screen.getByText('candidate-123')).toBeVisible();
    expect(screen.getByText('v7')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
