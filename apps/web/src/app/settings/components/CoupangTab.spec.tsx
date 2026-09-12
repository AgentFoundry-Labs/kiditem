import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CoupangTab from './CoupangTab';

describe('CoupangTab browser-session boundary', () => {
  it('stores only vendor identity and directs collection to the extension screens', () => {
    const onSaveSettings = vi.fn();
    render(
      <CoupangTab
        accountSettings={{
          configured: true,
          vendorId: 'A00012345',
          status: 'active',
          updatedAt: '2026-09-07T00:00:00.000Z',
        }}
        settingsLoading={false}
        isConfigured
        savingSettings={false}
        onSaveSettings={onSaveSettings}
      />,
    );

    expect(screen.queryByText('Access Key')).not.toBeInTheDocument();
    expect(screen.queryByText('Secret Key')).not.toBeInTheDocument();
    expect(screen.getByText(/브라우저 세션 수집만 지원/)).toBeInTheDocument();
    expect(screen.getByText(/서버 Open API 동기화를 제공하지 않습니다/)).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('A00012345'), { target: { value: 'A00098765' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onSaveSettings).toHaveBeenCalledWith({ vendorId: 'A00098765' });
  });
});
