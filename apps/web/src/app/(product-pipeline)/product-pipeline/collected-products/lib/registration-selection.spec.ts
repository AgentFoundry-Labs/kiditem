import { describe, expect, it } from 'vitest';
import {
  buildRegistrationThumbnailOptions,
  selectedThumbnailGenerationId,
  selectedThumbnailGenerationCandidateId,
} from './registration-selection';

describe('sourcing registration thumbnail selection', () => {
  it('keeps generated thumbnail candidates visible without auto-promoting them above source images', () => {
    const options = buildRegistrationThumbnailOptions({
      sourceImageUrls: ['https://cdn.example.com/source-a.jpg', 'https://cdn.example.com/source-b.jpg'],
      generations: [
        {
          id: 'generated-generation-1',
          candidates: [
            { id: 'generated-candidate-1', url: 'https://cdn.example.com/generated-a.jpg' },
          ],
        },
      ],
    });

    expect(options.map((option) => ({ url: option.url, kind: option.kind }))).toEqual([
      { url: 'https://cdn.example.com/source-a.jpg', kind: 'source' },
      { url: 'https://cdn.example.com/source-b.jpg', kind: 'source' },
      { url: 'https://cdn.example.com/generated-a.jpg', kind: 'generated' },
    ]);
    expect(options[2]).toEqual({
      url: 'https://cdn.example.com/generated-a.jpg',
      kind: 'generated',
      generatedGenerationId: 'generated-generation-1',
      generatedCandidateId: 'generated-candidate-1',
    });
  });

  it('resolves a generated candidate id only after the operator explicitly selects that URL', () => {
    const generations = [
      {
        id: 'generated-generation-1',
        candidates: [
          { id: 'generated-candidate-1', url: 'https://cdn.example.com/generated-a.jpg' },
        ],
      },
    ];

    expect(selectedThumbnailGenerationCandidateId(null, generations)).toBeNull();
    expect(
      selectedThumbnailGenerationCandidateId('https://cdn.example.com/source-a.jpg', generations),
    ).toBeNull();
    expect(
      selectedThumbnailGenerationCandidateId('https://cdn.example.com/generated-a.jpg', generations),
    ).toBe('generated-candidate-1');
    expect(
      selectedThumbnailGenerationId('https://cdn.example.com/generated-a.jpg', generations),
    ).toBe('generated-generation-1');
  });
});
