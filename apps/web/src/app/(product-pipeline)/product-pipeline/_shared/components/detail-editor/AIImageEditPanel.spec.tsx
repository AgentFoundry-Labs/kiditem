import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIImageEditPanel } from './AIImageEditPanel';

const submitImageEdit = vi.hoisted(() => vi.fn());
const pollImageEditTaskResult = vi.hoisted(() => vi.fn());
const cancelImageEditTaskAndRecoverResult = vi.hoisted(() => vi.fn());

vi.mock('./lib/image-edit-task', () => ({
  submitImageEdit,
  pollImageEditTaskResult,
  cancelImageEditTaskAndRecoverResult,
  isImageEditPollingCancelled: () => false,
  submitImageCrop: vi.fn(),
}));

describe('AIImageEditPanel', () => {
  beforeEach(() => {
    submitImageEdit.mockReset();
    pollImageEditTaskResult.mockReset();
    cancelImageEditTaskAndRecoverResult.mockReset();
  });

  it('clears the busy state after an edit completes under React Strict Mode', async () => {
    let resolvePoll!: (value: { image_url: string }) => void;
    const pollResult = new Promise<{ image_url: string }>((resolve) => {
      resolvePoll = resolve;
    });
    submitImageEdit.mockResolvedValue({ taskId: 'image-job-1' });
    pollImageEditTaskResult.mockReturnValue(pollResult);
    const onEditComplete = vi.fn();
    const onGeneratingChange = vi.fn();
    const isBusy = { current: false };

    render(
      <StrictMode>
        <AIImageEditPanel
          imageUrl="https://cdn.example.com/source.jpg"
          isBusy={isBusy}
          onEditComplete={onEditComplete}
          onReplace={vi.fn()}
          onGeneratingChange={onGeneratingChange}
          onClose={vi.fn()}
        />
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole('button', { name: '화질 개선' }));
    expect(await screen.findByText('AI 이미지 처리 중...')).toBeInTheDocument();

    resolvePoll({ image_url: 'https://cdn.example.com/edited.jpg' });

    await waitFor(() => {
      expect(onEditComplete).toHaveBeenCalledWith(
        'https://cdn.example.com/edited.jpg',
      );
      expect(screen.queryByText('AI 이미지 처리 중...')).not.toBeInTheDocument();
    });
    expect(isBusy.current).toBe(false);
    expect(onGeneratingChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: '화질 개선' })).toBeEnabled();
  });
});
