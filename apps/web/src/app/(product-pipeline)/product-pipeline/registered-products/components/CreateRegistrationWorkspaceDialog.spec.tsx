import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateRegistrationWorkspaceDialog } from './CreateRegistrationWorkspaceDialog';

describe('CreateRegistrationWorkspaceDialog', () => {
  it('submits a valid product title for an empty registration workspace', () => {
    const onSubmit = vi.fn();

    render(
      <CreateRegistrationWorkspaceDialog
        open
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('상품명'), {
      target: { value: '  키즈   컵  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '생성' }));

    expect(onSubmit).toHaveBeenCalledWith('키즈 컵');
  });

  it('blocks special characters in product titles before submit', () => {
    const onSubmit = vi.fn();

    render(
      <CreateRegistrationWorkspaceDialog
        open
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('상품명'), {
      target: { value: '키즈 컵!!!' },
    });

    expect(screen.getByText('상품명은 한글, 영문, 숫자, 공백만 사용할 수 있습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '생성' })).toBeDisabled();
  });
});
