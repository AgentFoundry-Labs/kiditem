// apps/server/src/products/__tests__/products.module.di.spec.ts
//
// DI wiring spec — Nest `TestingModule` 이 ProductsModule 을 실제로 compile/init 할 수 있는지
// 검증. tsc + unit vitest 는 provider 빠짐 / circular DI / 잘못된 토큰 등을 잡지 못한다.
// 프로젝트 AGENTS.md (root §3, apps/server §NestJS) 가 "NestJS 모듈/서비스 추가 시 dev:server 부팅
// 확인" 을 요구하는데, 이 스펙은 그 중 DI 그래프 부분을 테스트 차원에서 재현한다.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsModule } from '../products.module';
import { PRODUCT_MASTER_PROMOTION_PORT } from '../application/port/in/master-promotion.port';
import { MastersController } from '../adapter/in/http/masters.controller';
import { MasterImagesController } from '../adapter/in/http/master-images.controller';
import { OptionsController } from '../adapter/in/http/options.controller';
import { BundleComponentsController } from '../adapter/in/http/bundle-components.controller';
import { MastersService } from '../application/service/masters.service';
import { OptionsService } from '../application/service/options.service';
import { BundleComponentsService } from '../application/service/bundle-components.service';
import { MasterCodeRepositoryAdapter } from '../adapter/out/repository/master-code.repository.adapter';
import { MasterPromotionService } from '../application/service/master-promotion.service';
import { CategoriesController } from '../categories/categories.controller';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

// 실제 PrismaModule 과 동일한 @Global 계약으로 PrismaService 를 전파하는 stub.
// ProductsModule 내부 provider 들이 PrismaService 를 주입받으려면 같은 모양의 @Global
// 모듈이 DI 트리에 있어야 한다 (테스트 모듈 root 에 providers 만 선언하면 ProductsModule
// 내부에서 resolve 못 함).
@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} as unknown as PrismaService }],
  exports: [PrismaService],
})
class StubPrismaModule {}

// StorageModule 은 @Global 이지만 isolated TestingModule 에는 자동 주입되지 않는다.
// MastersService.uploadImage 가 StorageService 에 의존하므로 같은 @Global 계약으로 stub 제공.
@Global()
@Module({
  providers: [{ provide: StorageService, useValue: {} as unknown as StorageService }],
  exports: [StorageService],
})
class StubStorageModule {}

describe('ProductsModule DI', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [StubPrismaModule, StubStorageModule, ProductsModule],
    }).compile();
    await moduleRef.init();
  });

  afterAll(async () => { if (moduleRef) await moduleRef.close(); });

  it('resolves all product controllers', () => {
    expect(moduleRef.get(MastersController)).toBeDefined();
    expect(moduleRef.get(MasterImagesController)).toBeDefined();
    expect(moduleRef.get(OptionsController)).toBeDefined();
    expect(moduleRef.get(BundleComponentsController)).toBeDefined();
    expect(moduleRef.get(CategoriesController)).toBeDefined();
  });

  it('resolves all five services', () => {
    expect(moduleRef.get(MastersService)).toBeDefined();
    expect(moduleRef.get(MasterPromotionService)).toBeDefined();
    expect(moduleRef.get(OptionsService)).toBeDefined();
    expect(moduleRef.get(BundleComponentsService)).toBeDefined();
    expect(moduleRef.get(MasterCodeRepositoryAdapter)).toBeDefined();
    expect(moduleRef.get(CategoriesService)).toBeDefined();
  });

  it('exports products owner-side incoming ports for cross-owner consumers', () => {
    expect(moduleRef.get(PRODUCT_MASTER_PROMOTION_PORT)).toBeInstanceOf(MasterPromotionService);
  });

  it('keeps categories on the legacy /categories route segment', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CategoriesController)).toBe('categories');
  });
});
