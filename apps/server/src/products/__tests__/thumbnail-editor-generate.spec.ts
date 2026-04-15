import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThumbnailEditorController } from '../controllers/thumbnail-editor.controller';

function makeAiService() {
  return {
    generateFromInputs: vi.fn().mockResolvedValue([{ url: 'http://result.png', filename: 'result.png' }]),
    generateCreative: vi.fn().mockResolvedValue([{ url: 'http://creative.png', filename: 'creative.png' }]),
    fetchImageAsBase64Public: vi.fn().mockResolvedValue({ data: 'base64data', mimeType: 'image/jpeg' }),
  };
}

function makeGenerationService() {
  return {
    findProductForEditor: vi.fn().mockResolvedValue({ id: 'p1', imageUrl: 'http://orig.jpg', companyId: 'c1' }),
    saveEditorResult: vi.fn().mockResolvedValue('gen-1'),
  };
}

describe('ThumbnailEditorController.generate', () => {
  let controller: ThumbnailEditorController;
  let aiService: ReturnType<typeof makeAiService>;
  let genService: ReturnType<typeof makeGenerationService>;
  const companyId = 'company-1';

  beforeEach(() => {
    aiService = makeAiService();
    genService = makeGenerationService();
    controller = new ThumbnailEditorController(aiService as any, genService as any);
  });

  // ── Regression: 기존 동작 (mode 미지정) ──
  it('mode 미지정 + productImage → generateFromInputs 호출', async () => {
    const result = await controller.generate({
      productImage: 'data:image/png;base64,abc',
      purpose: 'compliance',
    }, companyId);

    expect(aiService.generateFromInputs).toHaveBeenCalledWith(
      [{ data: 'abc', mimeType: 'image/png', label: 'Product photo' }],
      undefined,
      'compliance',
      undefined,
    );
    expect(result.candidates).toHaveLength(1);
  });

  // ── Type 2A: 상품 + 박스 ──
  it('mode=edit + productImage + packagingImage → generateFromInputs', async () => {
    const result = await controller.generate({
      mode: 'edit',
      productImage: 'http://product.jpg',
      packagingImage: 'http://box.jpg',
      supplementaryLabel: '박스',
      purpose: 'compliance',
    }, companyId);

    expect(aiService.generateFromInputs).toHaveBeenCalled();
    const images = aiService.generateFromInputs.mock.calls[0][0];
    expect(images).toHaveLength(2);
    expect(images[0].label).toBe('Product photo');
    expect(images[1].label).toBe('박스');
  });

  // ── Type 2B: 색상별 사진 ──
  it('mode=edit + colorImages → 색상 variant 라벨로 generateFromInputs', async () => {
    const result = await controller.generate({
      mode: 'edit',
      colorImages: ['http://red.jpg', 'http://blue.jpg', 'http://pink.jpg'],
      purpose: 'compliance',
    }, companyId);

    expect(aiService.generateFromInputs).toHaveBeenCalled();
    const images = aiService.generateFromInputs.mock.calls[0][0];
    expect(images).toHaveLength(3);
    expect(images[0].label).toBe('Color variant 1');
    expect(images[1].label).toBe('Color variant 2');
    expect(images[2].label).toBe('Color variant 3');
  });

  // ── Type 3: Creative ──
  it('mode=creative → generateCreative 호출', async () => {
    const result = await controller.generate({
      mode: 'creative',
      productImage: 'data:image/png;base64,prod',
      sceneType: 'lifestyle',
      styleType: 'warm',
      productDescription: '유아 장난감',
      purpose: 'quality',
    }, companyId);

    expect(aiService.generateCreative).toHaveBeenCalledWith(
      [{ data: 'prod', mimeType: 'image/png', label: 'Product photo' }],
      'lifestyle',
      'warm',
      '유아 장난감',
      undefined,
    );
    expect(result.candidates).toHaveLength(1);
  });

  // ── Type 3: Creative + backgroundReference ──
  it('mode=creative + backgroundReference → 2장 이미지 전달', async () => {
    await controller.generate({
      mode: 'creative',
      productImage: 'http://product.jpg',
      backgroundReference: 'http://mood.jpg',
      purpose: 'quality',
    }, companyId);

    const images = aiService.generateCreative.mock.calls[0][0];
    expect(images).toHaveLength(2);
    expect(images[0].label).toBe('Product photo');
    expect(images[1].label).toBe('Style reference');
  });

  // ── Type 3: sceneType/styleType 기본값 ──
  it('mode=creative + sceneType 미지정 → 기본값 white-studio, minimal', async () => {
    await controller.generate({
      mode: 'creative',
      productImage: 'data:image/png;base64,x',
      purpose: 'quality',
    }, companyId);

    expect(aiService.generateCreative).toHaveBeenCalledWith(
      expect.any(Array),
      'white-studio',
      'minimal',
      undefined,
      undefined,
    );
  });

  // ── Creative 모드에서 productImage 없으면 에러 ──
  it('mode=creative + productImage 없음 → BadRequestException', async () => {
    await expect(
      controller.generate({ mode: 'creative', purpose: 'quality' }, companyId),
    ).rejects.toThrow('Creative 모드에는 상품 사진이 필요합니다');
  });

  // ── userPrompt 전달 ──
  it('userPrompt 전달됨', async () => {
    await controller.generate({
      productImage: 'data:image/png;base64,abc',
      purpose: 'compliance',
      userPrompt: '밝은 조명으로',
    }, companyId);

    expect(aiService.generateFromInputs).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
      'compliance',
      '밝은 조명으로',
    );
  });

  // ── saveEditorResult에 method 전달 ──
  it('creative → method=creative로 저장', async () => {
    await controller.generate({
      mode: 'creative',
      productId: 'p1',
      productImage: 'data:image/png;base64,x',
      purpose: 'quality',
    }, companyId);

    expect(genService.saveEditorResult).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'creative', companyId: 'company-1' }),
    );
  });

  it('edit → method=generate로 저장', async () => {
    await controller.generate({
      mode: 'edit',
      productId: 'p1',
      productImage: 'data:image/png;base64,x',
      purpose: 'compliance',
    }, companyId);

    expect(genService.saveEditorResult).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'generate', companyId: 'company-1' }),
    );
  });
});
