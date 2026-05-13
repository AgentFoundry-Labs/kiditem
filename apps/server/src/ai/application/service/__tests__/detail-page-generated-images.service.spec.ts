import { describe, expect, it, vi } from 'vitest';
import { DetailPageGeneratedImagesService } from '../detail-page-generated-images.service';

describe('DetailPageGeneratedImagesService', () => {
  it('keeps bold-vertical section image generation running when hero or size images fail', async () => {
    const heroImageService = {
      generateHeroBanner: vi.fn().mockRejectedValue(new Error('hero provider failed')),
      generateHeroProductImage: vi.fn().mockRejectedValue(new Error('hero product provider failed')),
      generateSizeGuideImage: vi.fn().mockRejectedValue(new Error('size provider failed')),
      generatePackageGuideImage: vi.fn().mockRejectedValue(new Error('package provider failed')),
      generateUsageGuideImage: vi.fn().mockImplementation((input: { variant: number }) => (
        Promise.resolve(`https://cdn.example.com/usage-${input.variant}.png`)
      )),
      generateDetailCutImage: vi.fn().mockImplementation((input: { variant: number }) => (
        Promise.resolve(`https://cdn.example.com/detail-${input.variant}.png`)
      )),
    };
    const service = new DetailPageGeneratedImagesService(heroImageService as never);

    const result = await service.generateBestEffort({
      organizationId: 'org-1',
      productName: '바삭바삭 수제왁스팝',
      templateId: 'bold-vertical',
      rawInput: {
        rawTitle: '바삭바삭 수제왁스팝',
        rawCategory: '완구',
        rawDescription: '손으로 누르는 촉감 놀이 상품',
        rawOptions: '색상 구성: 없음',
        imageUrls: [
          'https://example.com/main.jpg',
          'https://example.com/detail-1.jpg',
          'https://example.com/detail-2.jpg',
        ],
        detailImageCount: '2',
        usageSectionMode: 'include',
      },
      parsed: {
        hook: {
          subtext: '이달의 추천',
          text: '바삭바삭 수제왁스팝',
          titleSub: '즐거운 촉감놀이',
          description: '손끝으로 즐기는 말랑한 놀이',
          imageIndex: 0,
          bannerImageIndex: null,
        },
        section: { name: '놀이 포인트', title: '핵심 장점', subtitle: '촉감 놀이' },
        keyPoints: [],
        size: { subtitle: '9cm 구성', imageIndices: [0], heightLabel: '9cm', widthLabel: '9cm' },
        color: { subtitle: '핑크 단일 색상', imageIndices: [] },
        usage: {
          subtitle: '1. 포장을 열고 제품을 꺼내세요\n2. 손으로 가볍게 눌러보세요',
          imageIndices: [],
        },
        usageEnabled: true,
        detailImageIndices: [0, 1],
        productInfo: [],
      },
    });

    expect(result).toEqual({
      __usageGuideImage1: 'https://cdn.example.com/usage-1.png',
      __usageGuideImage2: 'https://cdn.example.com/usage-2.png',
      __detailImage1: 'https://cdn.example.com/detail-1.png',
      __detailImage2: 'https://cdn.example.com/detail-2.png',
    });
    expect(heroImageService.generateUsageGuideImage).toHaveBeenCalledTimes(2);
    expect(heroImageService.generateDetailCutImage).toHaveBeenCalledTimes(2);
  });

  it('does not generate fake package-opening usage images when an original package photo exists', async () => {
    const heroImageService = {
      generateHeroBanner: vi.fn().mockResolvedValue('https://cdn.example.com/hero.png'),
      generateHeroProductImage: vi.fn().mockResolvedValue('https://cdn.example.com/hero-product.png'),
      generateSizeGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/size.png'),
      generatePackageGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/package.png'),
      generateUsageGuideImage: vi.fn().mockImplementation((input: { variant: number }) => (
        Promise.resolve(`https://cdn.example.com/usage-${input.variant}.png`)
      )),
      generateDetailCutImage: vi.fn().mockResolvedValue('https://cdn.example.com/detail.png'),
    };
    const service = new DetailPageGeneratedImagesService(heroImageService as never);

    const result = await service.generateBestEffort({
      organizationId: 'org-1',
      productName: '바삭바삭 수제왁스팝',
      templateId: 'bold-vertical',
      rawInput: {
        rawTitle: '바삭바삭 수제왁스팝',
        rawCategory: '완구',
        rawDescription: '손으로 누르는 촉감 놀이 상품',
        rawOptions: '색상 구성: 없음',
        imageUrls: [
          'https://example.com/main.jpg',
          'https://example.com/package-box.jpg',
        ],
        detailImageCount: '2',
        usageSectionMode: 'include',
      },
      parsed: {
        hook: {
          subtext: '이달의 추천',
          text: '바삭바삭 수제왁스팝',
          titleSub: '즐거운 촉감놀이',
          description: '손끝으로 즐기는 말랑한 놀이',
          imageIndex: 0,
          bannerImageIndex: null,
        },
        section: { name: '놀이 포인트', title: '핵심 장점', subtitle: '촉감 놀이' },
        keyPoints: [],
        size: { subtitle: '9cm 구성', imageIndices: [0], heightLabel: '9cm', widthLabel: '9cm' },
        color: { subtitle: '핑크 단일 색상', imageIndices: [] },
        usage: {
          subtitle: '1. 포장을 열고 제품을 꺼내세요\n2. 손으로 가볍게 눌러보세요\n3. 원하는 모양으로 만들어보세요',
          imageIndices: [],
        },
        usageEnabled: true,
        detailImageIndices: [0],
        packageImageIndices: [1],
        packageLabel: '1박스 구성',
        productInfo: [],
      },
    });

    expect(result.__usageGuideImage1).toBeUndefined();
    expect(result.__usageGuideImage2).toBe('https://cdn.example.com/usage-2.png');
    expect(result.__usageGuideImage3).toBe('https://cdn.example.com/usage-3.png');
    expect(heroImageService.generateUsageGuideImage).toHaveBeenCalledTimes(2);
    expect(heroImageService.generateUsageGuideImage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        usageStep: '2. 손으로 가볍게 눌러보세요',
        variant: 2,
      }),
    );
  });

  it('never feeds package images into non-package bold-vertical generated media', async () => {
    const heroImageService = {
      generateHeroBanner: vi.fn().mockResolvedValue('https://cdn.example.com/hero.png'),
      generateHeroProductImage: vi.fn().mockResolvedValue('https://cdn.example.com/hero-product.png'),
      generateSizeGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/size.png'),
      generateColorGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/color.png'),
      generatePackageGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/package.png'),
      generateUsageGuideImage: vi.fn().mockImplementation((input: { variant: number }) => (
        Promise.resolve(`https://cdn.example.com/usage-${input.variant}.png`)
      )),
      generateDetailCutImage: vi.fn().mockImplementation((input: { variant: number }) => (
        Promise.resolve(`https://cdn.example.com/detail-${input.variant}.png`)
      )),
    };
    const service = new DetailPageGeneratedImagesService(heroImageService as never);

    await service.generateBestEffort({
      organizationId: 'org-1',
      productName: '퐁퐁 버블팝 슬라임',
      templateId: 'bold-vertical',
      rawInput: {
        rawTitle: '퐁퐁 버블팝 슬라임',
        rawCategory: '완구',
        rawDescription: '여러 색상의 슬라임 상품',
        rawOptions: '색상 구성: 여러 색상',
        imageUrls: [
          'https://example.com/product-main.jpg',
          'https://example.com/product-single.jpg',
          'https://example.com/package-box.jpg',
          'https://example.com/safety-label.jpg',
        ],
        detailImageCount: '1',
        usageSectionMode: 'include',
      },
      parsed: {
        hook: {
          subtext: '이달의 추천',
          text: '퐁퐁 버블팝 슬라임',
          titleSub: '말랑한 촉감 놀이',
          description: '손으로 늘려보는 슬라임',
          imageIndex: 2,
          bannerImageIndex: null,
        },
        section: { name: '놀이 포인트', title: '핵심 장점', subtitle: '촉감 놀이' },
        keyPoints: [],
        size: { subtitle: '12cm 구성', imageIndices: [2], heightLabel: '12cm', widthLabel: '5.5cm' },
        color: { subtitle: '노랑 / 보라 / 하늘색 / 핑크 4가지 색상', imageIndices: [2] },
        usage: {
          subtitle: '1. 손으로 가볍게 눌러 촉감을 확인하세요',
          imageIndices: [2],
        },
        usageEnabled: true,
        detailImageIndices: [2],
        packageImageIndices: [2],
        packageLabel: '1박스 12개입 구성',
        safetyLabelImageIndices: [3],
        productInfo: [],
      },
    });

    const normalSources = [
      'https://example.com/product-main.jpg',
      'https://example.com/product-single.jpg',
    ];
    expect(heroImageService.generateHeroBanner).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrls: normalSources }),
    );
    expect(heroImageService.generateHeroProductImage).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrls: normalSources }),
    );
    expect(heroImageService.generateSizeGuideImage).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrls: normalSources }),
    );
    expect(heroImageService.generateColorGuideImage).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrls: normalSources }),
    );
    for (const [input] of heroImageService.generateUsageGuideImage.mock.calls) {
      expect(input.imageUrls).toEqual(normalSources);
    }
    expect(heroImageService.generateDetailCutImage).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrls: normalSources }),
    );
  });

  it('keeps package-only photos out of non-package media when no normal product image remains', async () => {
    const heroImageService = {
      generateHeroBanner: vi.fn().mockResolvedValue('https://cdn.example.com/hero.png'),
      generateHeroProductImage: vi.fn().mockResolvedValue('https://cdn.example.com/hero-product.png'),
      generateSizeGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/size.png'),
      generateColorGuideImage: vi.fn(),
      generatePackageGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/package.png'),
      generateUsageGuideImage: vi.fn().mockImplementation((input: { variant: number }) => (
        Promise.resolve(`https://cdn.example.com/usage-${input.variant}.png`)
      )),
      generateDetailCutImage: vi.fn().mockImplementation((input: { variant: number }) => (
        Promise.resolve(`https://cdn.example.com/detail-${input.variant}.png`)
      )),
    };
    const service = new DetailPageGeneratedImagesService(heroImageService as never);
    const packageOnlySource = ['https://example.com/retail-box.jpg'];

    await service.generateBestEffort({
      organizationId: 'org-1',
      productName: '자석 다트게임',
      templateId: 'bold-vertical',
      rawInput: {
        rawTitle: '자석 다트게임',
        rawCategory: '키즈 완구',
        rawDescription: '자석 다트판과 안전 자석 다트로 실내에서 즐기는 키즈 완구',
        rawOptions: '색상 구성: 없음\n박스/세트 정보: AI가 업로드 이미지와 원본 설명으로 판단',
        imageUrls: packageOnlySource,
        detailImageCount: '2',
        usageSectionMode: 'include',
      },
      parsed: {
        hook: {
          subtext: '신나는 실내 놀이',
          text: '자석 다트게임',
          titleSub: '온 가족이 즐기는 다트',
          description: '벽 손상 걱정 없이 즐기는 자석 다트',
          imageIndex: null,
          bannerImageIndex: null,
        },
        section: { name: '놀이 포인트', title: '핵심 장점', subtitle: '실내 놀이' },
        keyPoints: [],
        size: { subtitle: '구성품 안내', imageIndices: [], heightLabel: '', widthLabel: '' },
        color: { subtitle: '', imageIndices: [] },
        usage: {
          subtitle: '1. 다트판을 벽에 걸어주세요\n2. 자석 다트를 던져 점수를 겨뤄보세요',
          imageIndices: [],
        },
        usageEnabled: true,
        detailImageIndices: [],
        packageImageIndices: [0],
        packageLabel: '세트 구성',
        productInfo: [],
      },
      excludedImageIndices: [0],
    });

    expect(heroImageService.generatePackageGuideImage).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrls: packageOnlySource }),
    );
    expect(heroImageService.generateHeroBanner).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrls: [] }),
    );
    expect(heroImageService.generateHeroProductImage).not.toHaveBeenCalled();
    expect(heroImageService.generateSizeGuideImage).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrls: [] }),
    );
    for (const [input] of heroImageService.generateUsageGuideImage.mock.calls) {
      expect(input.imageUrls).toEqual([]);
    }
    for (const [input] of heroImageService.generateDetailCutImage.mock.calls) {
      expect(input.imageUrls).toEqual([]);
    }
  });

  it('repairs stale package source selection before generating package and normal media', async () => {
    const heroImageService = {
      generateHeroBanner: vi.fn().mockResolvedValue('https://cdn.example.com/hero.png'),
      generateHeroProductImage: vi.fn().mockResolvedValue('https://cdn.example.com/hero-product.png'),
      generateSizeGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/size.png'),
      generateColorGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/color.png'),
      generatePackageGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/package.png'),
      generateUsageGuideImage: vi.fn(),
      generateDetailCutImage: vi.fn().mockResolvedValue('https://cdn.example.com/detail.png'),
    };
    const service = new DetailPageGeneratedImagesService(heroImageService as never);

    await service.generateBestEffort({
      organizationId: 'org-1',
      productName: '퐁퐁 버블팝 슬라임',
      templateId: 'bold-vertical',
      rawInput: {
        rawTitle: '퐁퐁 버블팝 슬라임',
        rawCategory: '완구',
        rawDescription: '여러 색상의 슬라임 상품',
        rawOptions: '색상 구성: 여러 색상',
        imageUrls: [
          'https://example.com/display-box.jpg',
          'https://example.com/hand-product.jpg',
          'https://example.com/usage-shot.jpg',
          'https://example.com/color-lineup.jpg',
        ],
        detailImageCount: '1',
        usageSectionMode: 'exclude',
      },
      parsed: {
        hook: {
          subtext: '이달의 추천',
          text: '퐁퐁 버블팝 슬라임',
          titleSub: '말랑한 촉감 놀이',
          description: '손으로 늘려보는 슬라임',
          imageIndex: 0,
          bannerImageIndex: null,
        },
        section: { name: '놀이 포인트', title: '핵심 장점', subtitle: '촉감 놀이' },
        keyPoints: [],
        size: { subtitle: '12cm 구성', imageIndices: [1], heightLabel: '12cm', widthLabel: '5.5cm' },
        color: { subtitle: '노랑 / 보라 / 하늘색 / 핑크 4가지 색상', imageIndices: [3] },
        usage: { subtitle: '', imageIndices: [] },
        usageEnabled: false,
        detailImageIndices: [1, 2],
        packageImageIndices: [3],
        packageLabel: '1박스 12개입 구성',
        productInfo: [],
      },
    });

    expect(heroImageService.generatePackageGuideImage).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: ['https://example.com/display-box.jpg'],
      }),
    );
    expect(heroImageService.generateHeroProductImage).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: [
          'https://example.com/hand-product.jpg',
          'https://example.com/usage-shot.jpg',
          'https://example.com/color-lineup.jpg',
        ],
      }),
    );
    expect(heroImageService.generateColorGuideImage).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: [
          'https://example.com/color-lineup.jpg',
          'https://example.com/hand-product.jpg',
          'https://example.com/usage-shot.jpg',
        ],
      }),
    );
  });

  it('prefers product section sources over hook/package candidates for the hero body product image', async () => {
    const heroImageService = {
      generateHeroBanner: vi.fn().mockResolvedValue('https://cdn.example.com/hero.png'),
      generateHeroProductImage: vi.fn().mockResolvedValue('https://cdn.example.com/hero-product.png'),
      generateSizeGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/size.png'),
      generateColorGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/color.png'),
      generatePackageGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/package.png'),
      generateUsageGuideImage: vi.fn(),
      generateDetailCutImage: vi.fn(),
    };
    const service = new DetailPageGeneratedImagesService(heroImageService as never);

    await service.generateBestEffort({
      organizationId: 'org-1',
      productName: '퐁퐁 버블팝 슬라임',
      templateId: 'bold-vertical',
      rawInput: {
        rawTitle: '퐁퐁 버블팝 슬라임',
        rawCategory: '완구',
        rawDescription: '여러 색상의 슬라임 상품',
        rawOptions: '색상 구성: 여러 색상',
        imageUrls: [
          'https://example.com/product-single.jpg',
          'https://example.com/display-box.jpg',
          'https://example.com/color-lineup.jpg',
        ],
        detailImageCount: '1',
        usageSectionMode: 'exclude',
      },
      parsed: {
        hook: {
          subtext: '이달의 추천',
          text: '퐁퐁 버블팝 슬라임',
          titleSub: '말랑한 촉감 놀이',
          description: '손으로 늘려보는 슬라임',
          imageIndex: 1,
          bannerImageIndex: null,
        },
        section: { name: '놀이 포인트', title: '핵심 장점', subtitle: '촉감 놀이' },
        keyPoints: [],
        size: { subtitle: '12cm 구성', imageIndices: [0], heightLabel: '12cm', widthLabel: '5.5cm' },
        color: { subtitle: '노랑 / 보라 / 하늘색 / 핑크 4가지 색상', imageIndices: [2] },
        usage: { subtitle: '', imageIndices: [] },
        usageEnabled: false,
        detailImageIndices: [],
        packageImageIndices: [1],
        packageLabel: '1박스 12개입 구성',
        productInfo: [],
      },
    });

    expect(heroImageService.generateHeroProductImage).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: [
          'https://example.com/product-single.jpg',
          'https://example.com/color-lineup.jpg',
        ],
      }),
    );
  });

  it('retries the hero body product image with preferred product sources when the full source group fails', async () => {
    const heroImageService = {
      generateHeroBanner: vi.fn().mockResolvedValue('https://cdn.example.com/hero.png'),
      generateHeroProductImage: vi.fn()
        .mockRejectedValueOnce(new Error('preferred source failed'))
        .mockResolvedValueOnce('https://cdn.example.com/hero-product-retry.png'),
      generateSizeGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/size.png'),
      generateColorGuideImage: vi.fn(),
      generatePackageGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/package.png'),
      generateUsageGuideImage: vi.fn(),
      generateDetailCutImage: vi.fn(),
    };
    const service = new DetailPageGeneratedImagesService(heroImageService as never);

    const result = await service.generateBestEffort({
      organizationId: 'org-1',
      productName: '퐁퐁 버블팝 슬라임',
      templateId: 'bold-vertical',
      rawInput: {
        rawTitle: '퐁퐁 버블팝 슬라임',
        rawCategory: '완구',
        rawDescription: '여러 색상의 슬라임 상품',
        rawOptions: '색상 구성: 여러 색상',
        imageUrls: [
          'https://example.com/product-single.jpg',
          'https://example.com/display-box.jpg',
          'https://example.com/color-lineup.jpg',
          'https://example.com/detail-closeup.jpg',
        ],
        detailImageCount: '1',
        usageSectionMode: 'exclude',
      },
      parsed: {
        hook: {
          subtext: '이달의 추천',
          text: '퐁퐁 버블팝 슬라임',
          titleSub: '말랑한 촉감 놀이',
          description: '손으로 늘려보는 슬라임',
          imageIndex: null,
          bannerImageIndex: null,
        },
        section: { name: '놀이 포인트', title: '핵심 장점', subtitle: '촉감 놀이' },
        keyPoints: [],
        size: { subtitle: '12cm 구성', imageIndices: [], heightLabel: '12cm', widthLabel: '5.5cm' },
        color: { subtitle: '노랑 / 보라 / 하늘색 / 핑크 4가지 색상', imageIndices: [2] },
        usage: { subtitle: '', imageIndices: [] },
        usageEnabled: false,
        detailImageIndices: [],
        packageImageIndices: [1],
        packageLabel: '1박스 12개입 구성',
        productInfo: [],
      },
    });

    expect(result.__heroProductImage).toBe('https://cdn.example.com/hero-product-retry.png');
    expect(heroImageService.generateHeroProductImage).toHaveBeenCalledTimes(2);
    expect(heroImageService.generateHeroProductImage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        imageUrls: [
          'https://example.com/product-single.jpg',
          'https://example.com/color-lineup.jpg',
          'https://example.com/detail-closeup.jpg',
        ],
      }),
    );
    expect(heroImageService.generateHeroProductImage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        imageUrls: ['https://example.com/color-lineup.jpg'],
      }),
    );
  });

  it('generates a clean color guide even when the source color image already exists', async () => {
    const heroImageService = {
      generateHeroBanner: vi.fn().mockResolvedValue('https://cdn.example.com/hero.png'),
      generateHeroProductImage: vi.fn().mockResolvedValue('https://cdn.example.com/hero-product.png'),
      generateSizeGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/size.png'),
      generateColorGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/color.png'),
      generatePackageGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/package.png'),
      generateUsageGuideImage: vi.fn(),
      generateDetailCutImage: vi.fn(),
    };
    const service = new DetailPageGeneratedImagesService(heroImageService as never);

    const result = await service.generateBestEffort({
      organizationId: 'org-1',
      productName: '퐁퐁 버블팝 슬라임',
      templateId: 'bold-vertical',
      rawInput: {
        rawTitle: '퐁퐁 버블팝 슬라임',
        rawCategory: '완구',
        rawDescription: '여러 색상의 슬라임 상품',
        rawOptions: '색상 구성: 여러 색상',
        imageUrls: [
          'https://example.com/main.jpg',
          'https://example.com/color-lineup.jpg',
          'https://example.com/package-box.jpg',
        ],
        detailImageCount: '2',
        usageSectionMode: 'exclude',
      },
      parsed: {
        hook: {
          subtext: '이달의 추천',
          text: '퐁퐁 버블팝 슬라임',
          titleSub: '말랑한 촉감 놀이',
          description: '손으로 늘려보는 슬라임',
          imageIndex: 0,
          bannerImageIndex: null,
        },
        section: { name: '놀이 포인트', title: '핵심 장점', subtitle: '촉감 놀이' },
        keyPoints: [],
        size: { subtitle: '12cm 구성', imageIndices: [0], heightLabel: '12cm', widthLabel: '5.5cm' },
        color: { subtitle: '노랑 / 보라 / 하늘색 / 핑크 4가지 색상', imageIndices: [1] },
        usage: { subtitle: '', imageIndices: [] },
        usageEnabled: false,
        detailImageIndices: [],
        packageImageIndices: [2],
        packageLabel: '1박스 구성',
        productInfo: [],
      },
    });

    expect(result.__colorGuideImage).toBe('https://cdn.example.com/color.png');
    expect(heroImageService.generateColorGuideImage).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: [
          'https://example.com/color-lineup.jpg',
          'https://example.com/main.jpg',
        ],
        productName: '퐁퐁 버블팝 슬라임',
      }),
    );
  });

  it('retries color guide generation with all normal product photos when the color source fails', async () => {
    const heroImageService = {
      generateHeroBanner: vi.fn().mockResolvedValue('https://cdn.example.com/hero.png'),
      generateHeroProductImage: vi.fn().mockResolvedValue('https://cdn.example.com/hero-product.png'),
      generateSizeGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/size.png'),
      generateColorGuideImage: vi.fn()
        .mockRejectedValueOnce(new Error('color source failed'))
        .mockResolvedValueOnce('https://cdn.example.com/color-retry.png'),
      generatePackageGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/package.png'),
      generateUsageGuideImage: vi.fn(),
      generateDetailCutImage: vi.fn(),
    };
    const service = new DetailPageGeneratedImagesService(heroImageService as never);

    const result = await service.generateBestEffort({
      organizationId: 'org-1',
      productName: '퐁퐁 버블팝 슬라임',
      templateId: 'bold-vertical',
      rawInput: {
        rawTitle: '퐁퐁 버블팝 슬라임',
        rawCategory: '완구',
        rawDescription: '여러 색상의 슬라임 상품',
        rawOptions: '색상 구성: 여러 색상',
        imageUrls: [
          'https://example.com/product-main.jpg',
          'https://example.com/display-box.jpg',
          'https://example.com/color-lineup.jpg',
          'https://example.com/detail-closeup.jpg',
        ],
        detailImageCount: '1',
        usageSectionMode: 'exclude',
      },
      parsed: {
        hook: {
          subtext: '이달의 추천',
          text: '퐁퐁 버블팝 슬라임',
          titleSub: '말랑한 촉감 놀이',
          description: '손으로 늘려보는 슬라임',
          imageIndex: null,
          bannerImageIndex: null,
        },
        section: { name: '놀이 포인트', title: '핵심 장점', subtitle: '촉감 놀이' },
        keyPoints: [],
        size: { subtitle: '12cm 구성', imageIndices: [], heightLabel: '12cm', widthLabel: '5.5cm' },
        color: { subtitle: '노랑 / 보라 / 하늘색 / 핑크 4가지 색상', imageIndices: [2] },
        usage: { subtitle: '', imageIndices: [] },
        usageEnabled: false,
        detailImageIndices: [],
        packageImageIndices: [1],
        packageLabel: '1박스 12개입 구성',
        productInfo: [],
      },
    });

    expect(result.__colorGuideImage).toBe('https://cdn.example.com/color-retry.png');
    expect(heroImageService.generateColorGuideImage).toHaveBeenCalledTimes(2);
    expect(heroImageService.generateColorGuideImage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        imageUrls: [
          'https://example.com/color-lineup.jpg',
          'https://example.com/product-main.jpg',
          'https://example.com/detail-closeup.jpg',
        ],
      }),
    );
    expect(heroImageService.generateColorGuideImage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        imageUrls: [
          'https://example.com/product-main.jpg',
          'https://example.com/color-lineup.jpg',
          'https://example.com/detail-closeup.jpg',
        ],
      }),
    );
  });
});
