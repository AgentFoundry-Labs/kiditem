// apps/server/src/products/__tests__/products.module.di.spec.ts
//
// DI wiring spec — Nest `TestingModule` 이 ProductsModule 을 실제로 compile/init 할 수 있는지
// 검증. tsc + unit vitest 는 provider 빠짐 / circular DI / 잘못된 토큰 등을 잡지 못한다.
// 프로젝트 CLAUDE.md (root §3, apps/server §NestJS) 가 "NestJS 모듈/서비스 추가 시 dev:server 부팅
// 확인" 을 요구하는데, 이 스펙은 그 중 DI 그래프 부분을 테스트 차원에서 재현한다.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsModule } from '../products.module';
import { MastersController } from '../controllers/masters.controller';
import { OptionsController } from '../controllers/options.controller';
import { BundleComponentsController } from '../controllers/bundle-components.controller';
import { MastersService } from '../services/masters.service';
import { OptionsService } from '../services/options.service';
import { BundleComponentsService } from '../services/bundle-components.service';
import { MasterCodeService } from '../services/master-code.service';
import { BundleStockService } from '../services/bundle-stock.service';
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

  it('resolves all three controllers', () => {
    expect(moduleRef.get(MastersController)).toBeDefined();
    expect(moduleRef.get(OptionsController)).toBeDefined();
    expect(moduleRef.get(BundleComponentsController)).toBeDefined();
  });

  it('resolves all five services', () => {
    expect(moduleRef.get(MastersService)).toBeDefined();
    expect(moduleRef.get(OptionsService)).toBeDefined();
    expect(moduleRef.get(BundleComponentsService)).toBeDefined();
    expect(moduleRef.get(MasterCodeService)).toBeDefined();
    expect(moduleRef.get(BundleStockService)).toBeDefined();
  });
});
