import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import officeCrypto = require('officecrypto-tool');
import { MALL_ORDERS_CHUNK_KIND, MALL_ORDERS_KIND } from '@kiditem/shared/orders-operations';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID as OTHER_ORG,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { ordersOperationsApp } from '../../test-helpers/orders-operations';
import { OPERATION_PORT, type OperationPort } from '../../common/operation/application/port/in/operation.port';
import { CHANNEL_ACCOUNT_PORT } from '../../channels/application/port/in/account/channel-account.port';
import { ChannelAccountService } from '../../channels/application/service/account/channel-account.service';
import { ChannelAccountPersistenceAdapter } from '../../channels/adapter/out/persistence/channel-account.persistence.adapter';
import { ChannelCredentialsAdapter } from '../../channels/adapter/out/credentials/channel-credentials.adapter';
import { ChannelsProductMappingGenerationAdapter } from '../../channels/adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { MallOrdersOperationOwner } from '../adapter/in/operation/mall-orders-operation-owner';
import { OrderCollectionController } from '../adapter/in/web/order-collection.controller';
import { OrderCollectionUploadController } from '../adapter/in/web/order-collection-upload.controller';
import { OrderOperationCapturePersistenceAdapter } from '../adapter/out/persistence/order-operation-capture.persistence.adapter';
import { OrderMallAccountPersistenceAdapter } from '../adapter/out/persistence/order-mall-account.persistence.adapter';
import { OrderCollectionSourceRepository } from '../adapter/out/repository/order-collection-source.repository';
import { ORDER_COLLECTION_SOURCE_PORT } from '../application/port/in/order-collection-source.port';
import { ORDER_OPERATION_CAPTURE_PORT } from '../application/port/in/order-operation-capture.port';
import { ORDER_MALL_ACCOUNT_PORT } from '../application/port/out/persistence/order-mall-account.port';
import { MallOrdersOperationService } from '../application/service/mall-orders-operation.service';
import { MALL_ORDERS_UPLOAD_PART_BYTES, MallOrdersUploadService } from '../application/service/mall-orders-upload.service';
import { OrderCollectionService } from '../application/service/order-collection.service';
import { SourceFailureAlerts } from '../../alerts/alerts.service';

// 수동 엑셀 업로드(KID-380 T4): 서버가 스스로 producer가 되어 `orders.mall_orders`(collectionMode manual-upload) 실행
// 하나를 begin → 파일 조각 청크 → finish로 한 요청 안에서 돈다. 옛 attempt·SourceImportRun은 쓰지 않는다. 변환은 실제
// 변환기, DB는 실제 PostgreSQL(Testcontainers).
const ICECREAM_HEADERS = ['주문번호', '배송번호', '주문완료일시', '주문내역상태', '배송종류', '배송처리유형', '주문판매유형', '합배송여부', '상품번호', '상품명', '단품명', '출고수량', '입점사', '회원ID', '주문자', '수취인', '수취인휴대폰번호', '우편번호', '배송지'];
const icecreamLine = (orderNo: string) => [orderNo, `D-${orderNo}`, '2026-09-26 10:00', '결제완료', '택배', '일반', '일반', 'N', 'P-1', '색종이', '빨강', '1', '키드아이템', 'member', '풍산초', '풍산초', '010-0000-0000', '06000', '서울 강남구'];

function workbook(rows: string[][]): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return Buffer.from(XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
}

describe('manual excel upload → orders.mall_orders (manual-upload) over the operation contract + disposable PG', () => {
  let prisma: PrismaClient;
  let harness: Awaited<ReturnType<typeof ordersOperationsApp>>;
  let domeggookAccount: string;
  let icecreamAccount: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const channelAccounts = new ChannelAccountService(
      new ChannelAccountPersistenceAdapter(prisma as never, new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter())),
      new ChannelCredentialsAdapter(),
    );
    harness = await ordersOperationsApp(prisma, {
      owners: [MallOrdersOperationOwner],
      controllers: [OrderCollectionController, OrderCollectionUploadController],
      providers: [
        MallOrdersOperationService,
        MallOrdersUploadService,
        OrderCollectionService,
        { provide: CHANNEL_ACCOUNT_PORT, useValue: channelAccounts },
        { provide: SourceFailureAlerts, useValue: new SourceFailureAlerts(prisma as never) },
        { provide: ORDER_OPERATION_CAPTURE_PORT, useClass: OrderOperationCapturePersistenceAdapter },
        { provide: ORDER_MALL_ACCOUNT_PORT, useClass: OrderMallAccountPersistenceAdapter },
        { provide: ORDER_COLLECTION_SOURCE_PORT, useClass: OrderCollectionSourceRepository },
      ],
    });
  });

  afterAll(async () => {
    await harness?.app.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const create = (channel: string, name: string) =>
      prisma.channelAccount.create({ data: { organizationId: ORG, channel, name, externalAccountId: channel, isPrimary: true } });
    domeggookAccount = (await create('domeggook', '도매꾹')).id;
    icecreamAccount = (await create('icecream-mall', '아이스크림몰')).id;
    await create('kidkids', '키드키즈');
  });

  const upload = (mallKey: string, file: { bytes: Buffer; name: string }, fields: Record<string, string> = {}, organizationId = ORG) => {
    const call = request(harness.httpUrl)
      .post(`/api/orders/collection/malls/${mallKey}/upload`)
      .set('x-test-org', organizationId)
      .attach('file', file.bytes, file.name);
    for (const [key, value] of Object.entries(fields)) call.field(key, value);
    return call;
  };
  const convert = (path: string, operationId: string) =>
    request(harness.httpUrl).post(`/api/orders/collection/${path}`).set('x-test-org', ORG).send({ operationId });

  it('도매꾹(1차 몰): 올린 CSV를 실행 하나로 보관하고(수집일 없음, 그 몰 계정) 주문 수를 적는다 — 변환은 실행 id로, 옛 run은 없다', async () => {
    const csv = Buffer.from('주문번호,주문일시,qty\r\nD-1,2026/09/25 10:00,1\r\nD-2,2026/09/26 10:00,2\r\n', 'utf8');
    const response = await upload('domeggook', { bytes: csv, name: 'ORDER_ALL.csv' }).expect(201);
    const operation = response.body.operation;
    expect(operation).toMatchObject({
      kind: MALL_ORDERS_KIND,
      status: 'succeeded',
      plan: { channelAccountId: domeggookAccount, mallKey: 'domeggook', mallName: '도매꾹', collectionDate: null, collectionMode: 'manual-upload' },
      // 수집일이 없으니 기간 확인은 없다 — 업로드한 파일 전체다.
      result: { rowCount: 2, mallKey: 'domeggook', captured: 1 },
    });
    expect(operation.result).not.toHaveProperty('coverage');
    const artifact = await prisma.orderCollectionArtifact.findFirstOrThrow({ where: { operationId: operation.id } });
    expect(artifact).toMatchObject({ organizationId: ORG, sourceImportRunId: null, sourceFileName: 'ORDER_ALL.csv', sourceContentType: 'text/csv' });
    expect(Buffer.from(artifact.sourceBytes).equals(csv)).toBe(true);
    await expect(prisma.sourceImportRun.count({ where: { organizationId: ORG } })).resolves.toBe(0);

    const converted = await convert('domeggook/convert', operation.id).expect(201);
    expect(converted.headers).toMatchObject({ 'x-order-collection-source-rows': '2', 'x-order-collection-output-rows': '2' });
    // 같은 파일을 다시 올려도 된다(옛 업로드처럼 매번 새 수집이다).
    await upload('domeggook', { bytes: csv, name: 'ORDER_ALL.csv' }).expect(201);
  });

  it('아이스크림몰(1차 몰): 암호 걸린 엑셀은 업로드 때 서버가 풀어 푼 파일을 보관하고, 실행 id 변환은 암호 없이 된다 — 틀린 암호는 실행을 만들지 않는다', async () => {
    const plain = workbook([ICECREAM_HEADERS, icecreamLine('20260926M0001'), icecreamLine('20260926M0002')]);
    const encrypted = officeCrypto.encrypt(plain, { password: 'icecream' }) as Buffer;

    const wrong = await upload('icecream-mall', { bytes: encrypted, name: '배송목록.xlsx' }, { password: 'nope' }).expect(400);
    expect(wrong.body.message).toContain('비밀번호');
    await expect(prisma.operation.count({ where: { organizationId: ORG } })).resolves.toBe(0);

    const response = await upload('icecream-mall', { bytes: encrypted, name: '배송목록.xlsx' }, { password: 'icecream' }).expect(201);
    expect(response.body.operation).toMatchObject({
      status: 'succeeded',
      // 수동 업로드도 변환 파일의 주문번호를 적는다(KID-234 Q3) — 오늘 주문·신규가 브라우저 수집과 같은 기준으로 센다.
      result: { rowCount: 2, mallKey: 'icecream-mall', captured: 1, orderNumbers: ['20260926M0001', '20260926M0002'] },
    });
    const artifact = await prisma.orderCollectionArtifact.findFirstOrThrow({ where: { operationId: response.body.operation.id } });
    expect(artifact).toMatchObject({ sourceFileName: '배송목록.xlsx', sourceContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(officeCrypto.isEncrypted(Buffer.from(artifact.sourceBytes))).toBe(false);

    const converted = await convert('icecream-mall/convert', response.body.operation.id).expect(201);
    expect(converted.headers['x-order-collection-source-rows']).toBe('2');
  });

  it('GS샵(H3′ 몰): 올린 .xlsx를 그 이름·xlsx 형식 그대로 보관하고 gsshop 변환 라우트가 실행 id로 셀피아 행을 돌려준다', async () => {
    await prisma.channelAccount.create({ data: { organizationId: ORG, channel: 'gs-shop', name: 'GS샵', externalAccountId: 'gs-shop', isPrimary: true } });
    const headers = ['주문번호', '속성상품코드', '상품명', '수량'];
    const xlsx = workbook([headers, ['G-1', 'A-1', '색종이', '1'], ['G-2', 'A-2', '크레파스', '2'], ['G-3', 'A-3', '풀', '1']]);
    const response = await upload('gs-shop', { bytes: xlsx, name: 'GS샵_직송주문.xlsx' }).expect(201);
    const operation = response.body.operation;
    expect(operation).toMatchObject({
      status: 'succeeded',
      plan: { mallKey: 'gs-shop', mallName: 'GS샵', collectionDate: null, collectionMode: 'manual-upload' },
      result: { rowCount: 3, mallKey: 'gs-shop', captured: 1, orderNumbers: ['G-1', 'G-2', 'G-3'] },
    });
    const artifact = await prisma.orderCollectionArtifact.findFirstOrThrow({ where: { operationId: operation.id } });
    expect(artifact).toMatchObject({ sourceFileName: 'GS샵_직송주문.xlsx', sourceContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    expect(Buffer.from(artifact.sourceBytes).equals(xlsx)).toBe(true);

    const converted = await convert('gsshop/convert', operation.id).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    }).expect(201);
    expect(converted.headers).toMatchObject({ 'x-order-collection-source-rows': '3', 'x-order-collection-output-rows': '3' });
    const book = XLSX.read(converted.body as Buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0]!]!, { header: 1, raw: false, defval: '' });
    // 셀피아 참조 양식 머리글(속성상품코드 → 상품상세코드)과 올린 행 그대로.
    expect(rows).toEqual([['주문번호', '상품상세코드', '상품명', '수량'], ['G-1', 'A-1', '색종이', '1'], ['G-2', 'A-2', '크레파스', '2'], ['G-3', 'A-3', '풀', '1']]);
  });

  it('조각 크기보다 큰 파일은 여러 청크로 나눠 올리고 finalize가 바이트 그대로 잇는다', async () => {
    const line = (index: number) => `D-${String(index).padStart(6, '0')},2026/09/26 10:00,${'가'.repeat(40)}\r\n`;
    let csv = '주문번호,주문일시,memo\r\n';
    for (let index = 0; Buffer.byteLength(csv) < MALL_ORDERS_UPLOAD_PART_BYTES * 2 + 1000; index += 1) csv += line(index);
    const bytes = Buffer.from(csv, 'utf8');
    expect(bytes.length).toBeGreaterThan(MALL_ORDERS_UPLOAD_PART_BYTES * 2);
    // 조각을 따로 base64로 바꿔 글자로 잇는다 — 3의 배수가 아니면 중간 조각의 `=` 채움이 이은 바이트를 깨뜨린다.
    expect(MALL_ORDERS_UPLOAD_PART_BYTES % 3).toBe(0);
    // 청크 표는 실행이 끝나면 비워진다 — 실행 계약의 문(putChunk)에서 조각을 본다.
    const putChunk = vi.spyOn(harness.app.get<OperationPort>(OPERATION_PORT), 'putChunk');
    const response = await upload('domeggook', { bytes, name: 'ORDER_BIG.csv' }).expect(201);
    const operationId = response.body.operation.id as string;
    const puts = putChunk.mock.calls.map(([input]) => input);
    putChunk.mockRestore();
    expect(puts.map((input) => [input.chunkKind, input.sequence])).toEqual([[MALL_ORDERS_CHUNK_KIND, 1], [MALL_ORDERS_CHUNK_KIND, 2], [MALL_ORDERS_CHUNK_KIND, 3]]);
    expect(puts.map((input) => (input.request.payload[0] as { part: number; parts: number }))).toEqual([
      expect.objectContaining({ part: 0, parts: 3 }), expect.objectContaining({ part: 1, parts: 3 }), expect.objectContaining({ part: 2, parts: 3 }),
    ]);
    expect(response.body.operation).toMatchObject({ status: 'succeeded', result: { captured: 1 } });
    const artifact = await prisma.orderCollectionArtifact.findFirstOrThrow({ where: { operationId } });
    expect(Buffer.from(artifact.sourceBytes).equals(bytes)).toBe(true);
  });

  it('변환기가 거절한 파일은 실행을 실패로 닫고 그 문장을 돌려준다 — 캡처는 남지 않는다', async () => {
    const response = await upload('icecream-mall', { bytes: workbook([['주문번호'], ['X']]), name: '엉뚱한.xlsx' }).expect(400);
    expect(response.body.message).toContain('필수 컬럼');
    const operations = await prisma.operation.findMany({ where: { organizationId: ORG } });
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ kind: MALL_ORDERS_KIND, status: 'failed', errorCode: 'CONVERSION_FAILED' });
    await expect(prisma.orderCollectionArtifact.count({ where: { organizationId: ORG } })).resolves.toBe(0);
  });

  it('업로드를 받지 않는 몰·계정 없는 몰·파일 없는 요청은 실행 없이 거절한다', async () => {
    const csv = { bytes: Buffer.from('a,b\r\n1,2\r\n', 'utf8'), name: 'x.csv' };
    expect((await upload('kidkids', csv).expect(400)).body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'manual_upload_unsupported' } });
    expect((await upload('gs-shop', csv).expect(404)).body).toMatchObject({ code: 'CHANNELS_ACCOUNT_NOT_FOUND' });
    expect((await upload('domeggook', csv, {}, OTHER_ORG).expect(404)).body).toMatchObject({ code: 'CHANNELS_ACCOUNT_NOT_FOUND' });
    const missing = await request(harness.httpUrl).post('/api/orders/collection/malls/domeggook/upload').set('x-test-org', ORG).expect(400);
    expect(missing.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { reason: 'upload_file_missing' } });
    await expect(prisma.operation.count()).resolves.toBe(0);
  });
});
