import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── @aws-sdk/client-s3 mock ─────────────────────────────────────────────────
// vi.mock is hoisted — must be declared before importing the module under test.

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    send = mockSend;
    constructor(_config?: unknown) {}
  },
  PutObjectCommand: class MockPutObjectCommand {
    __type = 'PutObject';
    constructor(args: Record<string, unknown>) {
      Object.assign(this, args);
    }
  },
  CopyObjectCommand: class MockCopyObjectCommand {
    __type = 'CopyObject';
    constructor(args: Record<string, unknown>) {
      Object.assign(this, args);
    }
  },
  DeleteObjectCommand: class MockDeleteObjectCommand {
    __type = 'DeleteObject';
    constructor(args: Record<string, unknown>) {
      Object.assign(this, args);
    }
  },
  HeadBucketCommand: class MockHeadBucketCommand {
    __type = 'HeadBucket';
    constructor(args: Record<string, unknown>) {
      Object.assign(this, args);
    }
  },
}));

import { StorageService } from '../storage.service';

// ── Env snapshot helpers ────────────────────────────────────────────────────

const ENV_KEYS = [
  'NODE_ENV',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_REGION',
  'S3_PUBLIC_URL',
] as const;

function snapshotEnv() {
  const snap: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

function clearS3Env() {
  delete process.env.S3_ENDPOINT;
  delete process.env.S3_BUCKET;
  delete process.env.S3_ACCESS_KEY;
  delete process.env.S3_SECRET_KEY;
  delete process.env.S3_REGION;
  delete process.env.S3_PUBLIC_URL;
}

describe('StorageService', () => {
  let envSnap: Record<string, string | undefined>;

  beforeEach(() => {
    mockSend.mockReset();
    envSnap = snapshotEnv();
    // dev env 기본값 사용 (S3_* unset)
    process.env.NODE_ENV = 'development';
    clearS3Env();
  });

  afterEach(() => {
    restoreEnv(envSnap);
  });

  describe('save', () => {
    it('PutObjectCommand 호출 + public URL 반환', async () => {
      mockSend.mockResolvedValueOnce({});
      const service = new StorageService();

      const buffer = Buffer.from('hello');
      const url = await service.save('images/a.png', buffer, 'image/png');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.__type).toBe('PutObject');
      expect(cmd.Bucket).toBe('kiditem');
      expect(cmd.Key).toBe('images/a.png');
      expect(cmd.Body).toBe(buffer);
      expect(cmd.ContentType).toBe('image/png');
      expect(url).toBe('http://localhost:9000/kiditem/images/a.png');
    });
  });

  describe('copy', () => {
    it('CopyObjectCommand의 CopySource가 "/bucket/fromKey" 포맷', async () => {
      mockSend.mockResolvedValueOnce({});
      const service = new StorageService();

      const url = await service.copy('src/a.png', 'dst/b.png');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.__type).toBe('CopyObject');
      expect(cmd.Bucket).toBe('kiditem');
      expect(cmd.CopySource).toBe('/kiditem/src/a.png');
      expect(cmd.Key).toBe('dst/b.png');
      expect(url).toBe('http://localhost:9000/kiditem/dst/b.png');
    });
  });

  describe('delete', () => {
    it('DeleteObjectCommand 호출', async () => {
      mockSend.mockResolvedValueOnce({});
      const service = new StorageService();

      await service.delete('images/a.png');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.__type).toBe('DeleteObject');
      expect(cmd.Bucket).toBe('kiditem');
      expect(cmd.Key).toBe('images/a.png');
    });
  });

  describe('getUrl', () => {
    it('publicUrl + "/" + key 반환', () => {
      const service = new StorageService();
      expect(service.getUrl('folder/x.jpg')).toBe('http://localhost:9000/kiditem/folder/x.jpg');
    });

    it('S3_PUBLIC_URL 환경변수 우선', () => {
      process.env.S3_PUBLIC_URL = 'https://cdn.example.com';
      const service = new StorageService();
      expect(service.getUrl('x.jpg')).toBe('https://cdn.example.com/x.jpg');
    });
  });

  describe('extractKey', () => {
    it('publicUrl prefix로 시작하는 url → key 반환', () => {
      const service = new StorageService();
      const key = service.extractKey('http://localhost:9000/kiditem/images/a.png');
      expect(key).toBe('images/a.png');
    });

    it('publicUrl prefix가 아닌 url → null', () => {
      const service = new StorageService();
      expect(service.extractKey('https://other.com/images/a.png')).toBeNull();
    });

    it('publicUrl과 동일하지만 "/" 구분자 없는 url → null', () => {
      const service = new StorageService();
      // "http://localhost:9000/kiditem" (슬래시 없음) → null
      expect(service.extractKey('http://localhost:9000/kiditem')).toBeNull();
    });
  });

  describe('onModuleInit', () => {
    it('HeadBucket 성공 → logger.log 호출, throw 없음', async () => {
      mockSend.mockResolvedValueOnce({});
      const service = new StorageService();

      const logSpy = vi.spyOn((service as any).logger, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn((service as any).logger, 'warn').mockImplementation(() => {});

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.__type).toBe('HeadBucket');
      expect(cmd.Bucket).toBe('kiditem');
      expect(logSpy).toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('HeadBucket 실패 → logger.warn 호출, throw 없음', async () => {
      const err = Object.assign(new Error('no bucket'), { name: 'NoSuchBucket' });
      mockSend.mockRejectedValueOnce(err);
      const service = new StorageService();

      const logSpy = vi.spyOn((service as any).logger, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn((service as any).logger, 'warn').mockImplementation(() => {});

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('constructor env validation', () => {
    it('NODE_ENV=production + S3 env 없음 → Error throw', () => {
      process.env.NODE_ENV = 'production';
      clearS3Env();

      expect(() => new StorageService()).toThrow(/S3_ENDPOINT/);
    });

    it('NODE_ENV=development + env 없음 → 기본값으로 instantiate 성공', () => {
      process.env.NODE_ENV = 'development';
      clearS3Env();

      expect(() => new StorageService()).not.toThrow();
    });

    it('NODE_ENV=production + 모든 S3 env 설정 → instantiate 성공', () => {
      process.env.NODE_ENV = 'production';
      process.env.S3_ENDPOINT = 'https://s3.amazonaws.com';
      process.env.S3_BUCKET = 'prod-bucket';
      process.env.S3_ACCESS_KEY = 'AKIA...';
      process.env.S3_SECRET_KEY = 'secret';

      expect(() => new StorageService()).not.toThrow();
    });
  });
});
