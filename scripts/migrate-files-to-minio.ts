/**
 * 로컬 디스크 → MinIO 이미지 마이그레이션 + DB URL 업데이트
 *
 * 대상:
 *   1. generated-thumbnails/*.png → MinIO kiditem/generated-thumbnails/*.png
 *   2. data/product-images/{productId}/*.{png,jpg,webp} → MinIO kiditem/product-images/{productId}/*
 *   3. ThumbnailGeneration.candidates JSON의 old URL → new MinIO URL
 *   4. Product.images JSON의 old URL → new MinIO URL
 *
 * 사용법:
 *   npx tsx scripts/migrate-files-to-minio.ts --dry-run    (로그만)
 *   npx tsx scripts/migrate-files-to-minio.ts              (실제 실행)
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { S3Client, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
// 서버 프로세스는 apps/server/에서 실행됨 → 파일도 거기 있음
const SERVER_CWD = path.join(process.cwd(), 'apps', 'server');
const GENERATED_DIR = path.join(SERVER_CWD, 'generated-thumbnails');
const PRODUCT_IMAGES_DIR = path.join(SERVER_CWD, 'data', 'product-images');

const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000';
const S3_BUCKET = process.env.S3_BUCKET || 'kiditem';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'minioadmin';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'minioadmin';
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || `${S3_ENDPOINT}/${S3_BUCKET}`;

const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  forcePathStyle: true,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const stats = {
  filesUploaded: 0,
  filesSkipped: 0,
  thumbnailGenerationsUpdated: 0,
  productsUpdated: 0,
};

function mimeFromExt(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

/** old URL (e.g. /generated-thumbnails/x.png) → key (generated-thumbnails/x.png) */
function urlToKey(oldUrl: string): string | null {
  if (oldUrl.startsWith('/generated-thumbnails/')) return oldUrl.substring(1);
  if (oldUrl.startsWith('/product-images/')) return oldUrl.substring(1);
  return null;
}

function keyToPublicUrl(key: string): string {
  return `${S3_PUBLIC_URL}/${key}`;
}

async function uploadFile(key: string, localPath: string): Promise<boolean> {
  if (!fs.existsSync(localPath)) {
    console.log(`  SKIP (파일 없음): ${localPath}`);
    stats.filesSkipped++;
    return false;
  }
  const buffer = fs.readFileSync(localPath);
  const mimeType = mimeFromExt(localPath);
  if (DRY_RUN) {
    console.log(`  [DRY] upload ${key} ← ${localPath} (${mimeType}, ${buffer.length}B)`);
  } else {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    console.log(`  UP   ${key} (${buffer.length}B)`);
  }
  stats.filesUploaded++;
  return true;
}

async function walkDirAndUpload(localDir: string, keyPrefix: string) {
  if (!fs.existsSync(localDir)) {
    console.log(`  디렉토리 없음, 스킵: ${localDir}`);
    return;
  }
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    if (entry.isDirectory()) {
      await walkDirAndUpload(localPath, `${keyPrefix}/${entry.name}`);
    } else if (entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name)) {
      const key = `${keyPrefix}/${entry.name}`;
      await uploadFile(key, localPath);
    }
  }
}

async function migrateFiles() {
  console.log('== 1. 로컬 파일 → MinIO 업로드 ==');
  console.log(`generated-thumbnails:`);
  await walkDirAndUpload(GENERATED_DIR, 'generated-thumbnails');
  console.log(`product-images:`);
  await walkDirAndUpload(PRODUCT_IMAGES_DIR, 'product-images');
}

function rewriteUrl(oldUrl: string): string | null {
  const key = urlToKey(oldUrl);
  if (!key) return null;
  return keyToPublicUrl(key);
}

async function migrateThumbnailGenerations() {
  console.log('\n== 2. ThumbnailGeneration URL 업데이트 ==');
  // 전체 조회 후 코드에서 필터링 (Prisma Json string_contains가 배열 내부를 못 매칭하는 경우 있음)
  const rows = await prisma.thumbnailGeneration.findMany();
  console.log(`  전체 레코드: ${rows.length}개`);

  for (const row of rows) {
    const updates: any = {};

    if (Array.isArray(row.candidates)) {
      const newCandidates = (row.candidates as any[]).map((c) => {
        if (c && typeof c === 'object' && 'url' in c) {
          const newUrl = rewriteUrl(c.url as string);
          if (newUrl) return { ...c, url: newUrl };
        }
        return c;
      });
      updates.candidates = newCandidates;
    }

    if (row.originalUrl) {
      const newUrl = rewriteUrl(row.originalUrl);
      if (newUrl) updates.originalUrl = newUrl;
    }

    if (row.selectedUrl) {
      const newUrl = rewriteUrl(row.selectedUrl);
      if (newUrl) updates.selectedUrl = newUrl;
    }

    if (Object.keys(updates).length === 0) continue;

    if (DRY_RUN) {
      console.log(`  [DRY] ThumbnailGeneration ${row.id} → ${JSON.stringify(updates).substring(0, 120)}...`);
    } else {
      await prisma.thumbnailGeneration.update({ where: { id: row.id }, data: updates });
      console.log(`  UPD  ThumbnailGeneration ${row.id}`);
    }
    stats.thumbnailGenerationsUpdated++;
  }
}

async function migrateProductImages() {
  console.log('\n== 3. Product.images URL 업데이트 ==');
  const rows = await prisma.product.findMany({ where: { images: { not: null as any } } });
  console.log(`  전체 레코드 (images != null): ${rows.length}개`);

  for (const row of rows) {
    if (!Array.isArray(row.images)) continue;
    const newImages = (row.images as any[]).map((img) => {
      if (img && typeof img === 'object' && 'url' in img) {
        const newUrl = rewriteUrl(img.url as string);
        if (newUrl) return { ...img, url: newUrl };
      }
      return img;
    });

    if (DRY_RUN) {
      console.log(`  [DRY] Product ${row.id} images 업데이트`);
    } else {
      await prisma.product.update({ where: { id: row.id }, data: { images: newImages as any } });
      console.log(`  UPD  Product ${row.id}`);
    }
    stats.productsUpdated++;
  }
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN MODE ===' : '=== 실제 실행 모드 ===');
  console.log(`S3_ENDPOINT: ${S3_ENDPOINT}`);
  console.log(`S3_BUCKET:   ${S3_BUCKET}`);
  console.log(`PUBLIC_URL:  ${S3_PUBLIC_URL}`);
  console.log('');

  // 버킷 접근 확인
  try {
    await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
  } catch (err: any) {
    console.error(`MinIO 버킷 "${S3_BUCKET}" 접근 실패: ${err?.name ?? err}`);
    console.error('docker compose up -d minio 로 MinIO를 먼저 시작하세요.');
    process.exit(1);
  }

  await migrateFiles();
  await migrateThumbnailGenerations();
  await migrateProductImages();

  console.log('\n== 요약 ==');
  console.log(`  업로드된 파일: ${stats.filesUploaded}`);
  console.log(`  스킵된 파일:   ${stats.filesSkipped}`);
  console.log(`  갱신된 썸네일 generation: ${stats.thumbnailGenerationsUpdated}`);
  console.log(`  갱신된 product:          ${stats.productsUpdated}`);
  console.log(DRY_RUN ? '\nDRY RUN 완료. 실제 반영하려면 --dry-run 없이 다시 실행.' : '\n완료.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
