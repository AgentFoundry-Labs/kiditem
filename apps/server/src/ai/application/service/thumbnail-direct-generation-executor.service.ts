import { Injectable } from '@nestjs/common';
import type {
  ThumbnailGenerateDirectInput,
  ThumbnailGenerateDirectOutput,
} from '../../domain/direct-generation';
import type {
  ThumbnailEditorCandidate,
  ThumbnailEditorInputImage,
} from '../../domain/model/thumbnail-editor';
import { ThumbnailEditorAiService } from './thumbnail-editor-ai.service';

@Injectable()
export class ThumbnailDirectGenerationExecutorService {
  constructor(private readonly editorAi: ThumbnailEditorAiService) {}

  async execute(input: {
    organizationId: string;
    generationInput: ThumbnailGenerateDirectInput;
    model?: string;
  }): Promise<ThumbnailGenerateDirectOutput> {
    const inputs = input.generationInput.inputs.map(toEditorInput);
    const candidates: ThumbnailEditorCandidate[] =
      input.generationInput.mode === 'creative'
        ? await this.editorAi.generateCreative(inputs, input.organizationId, {
            model: input.model,
            sceneType: input.generationInput.sceneType,
            styleType: input.generationInput.styleType,
            productDescription: input.generationInput.productDescription,
            userPrompt: input.generationInput.userPrompt,
            productName: input.generationInput.productName ?? null,
            category: input.generationInput.category ?? null,
            hasStyleReference: input.generationInput.hasStyleReference,
          })
        : await this.editorAi.generateEdit(inputs, input.organizationId, {
            model: input.model,
            purpose: input.generationInput.purpose ?? 'compliance',
            editCase: input.generationInput.editCase ?? 'single',
            composition: input.generationInput.composition,
            userPrompt: input.generationInput.userPrompt,
            layout: input.generationInput.layout,
            productDescription: input.generationInput.productDescription,
            productName: input.generationInput.productName ?? null,
            category: input.generationInput.category ?? null,
          });

    if (candidates.length === 0) {
      throw new Error('Gemini image generation returned no candidates.');
    }

    return {
      candidates: candidates.map((candidate) => ({
        url: candidate.url,
        filename: candidate.filename ?? null,
        storageKey: candidate.storageKey ?? null,
        mimeType: candidate.mimeType ?? null,
        fileSize: candidate.fileSize ?? null,
      })),
    };
  }
}

function toEditorInput(
  image: ThumbnailGenerateDirectInput['inputs'][number],
): ThumbnailEditorInputImage {
  return {
    data: image.data,
    mimeType: image.mimeType,
    label: image.label,
    url: image.url,
    storageKey: image.storageKey,
    role: image.role,
    sortOrder: image.sortOrder,
    source: image.source,
    fileSize: image.fileSize,
  };
}
