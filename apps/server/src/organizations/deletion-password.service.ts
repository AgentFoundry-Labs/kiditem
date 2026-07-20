import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// promisify(scrypt) 는 cost 옵션을 받는 4-인자 오버로드를 잃는다. 직접 감싼다.
const scryptAsync = (
  password: string,
  salt: Buffer,
  keylen: number,
  cost: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, { N: cost }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });

/**
 * 조직별 **삭제 전용 비밀번호**.
 *
 * 쿠팡 상품 삭제처럼 되돌릴 수 없는 동작 앞에 세우는 게이트다. 계정 비밀번호를
 * 화면에서 다시 받지 않기 위해 별도 비밀번호를 둔다.
 *
 * 저장 규칙
 *  - 평문은 **절대** 저장하지 않는다. scrypt(N=16384) + 랜덤 16바이트 salt 로만 저장한다.
 *    (`apps/server` 에 bcrypt/argon2 의존성이 없어 Node 내장 crypto 를 쓴다.)
 *  - 해시/솔트는 어떤 응답에도 나가지 않는다. 외부로 나가는 것은 `configured` 뿐이다.
 *  - 비교는 반드시 서버에서, `timingSafeEqual` 로 한다.
 *
 * 저장 위치는 `SystemSetting(organizationId, key)` 다 — 조직 스코프 key/value 가
 * 이미 있어 스키마 변경 없이 조직 경계를 그대로 물려받는다.
 */
const DELETION_PASSWORD_KEY = 'security.deletion_password';
const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16_384;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

interface StoredDeletionPassword {
  // Prisma Json 입력은 인덱스 시그니처를 요구한다.
  [key: string]: string | number;
  algorithm: 'scrypt';
  salt: string;
  hash: string;
  keylen: number;
  cost: number;
  updatedAt: string;
}

@Injectable()
export class DeletionPasswordService {
  constructor(private readonly prisma: PrismaService) {}

  /** 화면에 내보내도 되는 유일한 상태. 해시는 절대 포함하지 않는다. */
  async getStatus(organizationId: string): Promise<{ configured: boolean; updatedAt: string | null }> {
    const stored = await this.load(organizationId);
    return { configured: stored !== null, updatedAt: stored?.updatedAt ?? null };
  }

  /**
   * 등록/변경. 이미 설정돼 있으면 현재 비밀번호를 함께 요구한다 —
   * 세션만 탈취하면 게이트를 갈아끼울 수 있게 두면 게이트가 아니다.
   */
  async setPassword(
    organizationId: string,
    input: { currentPassword?: string | null; newPassword: string },
  ): Promise<{ configured: true; updatedAt: string }> {
    const newPassword = input.newPassword ?? '';
    if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `삭제 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상 ${MAX_PASSWORD_LENGTH}자 이하여야 합니다.`,
      );
    }

    const existing = await this.load(organizationId);
    if (existing) {
      const current = input.currentPassword ?? '';
      if (!current) {
        throw new BadRequestException('현재 삭제 비밀번호를 입력해야 변경할 수 있습니다.');
      }
      if (!(await this.matches(existing, current))) {
        throw new ForbiddenException('현재 삭제 비밀번호가 일치하지 않습니다.');
      }
    }

    const salt = randomBytes(16);
    const hash = await scryptAsync(newPassword, salt, SCRYPT_KEYLEN, SCRYPT_COST);
    const value: StoredDeletionPassword = {
      algorithm: 'scrypt',
      salt: salt.toString('base64'),
      hash: hash.toString('base64'),
      keylen: SCRYPT_KEYLEN,
      cost: SCRYPT_COST,
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.systemSetting.upsert({
      where: {
        organizationId_key: { organizationId, key: DELETION_PASSWORD_KEY },
      },
      create: { organizationId, key: DELETION_PASSWORD_KEY, value },
      update: { value },
    });
    return { configured: true, updatedAt: value.updatedAt };
  }

  /**
   * 삭제 실행 직전 검증. 실패는 전부 예외다 — boolean 을 돌려주면 호출부가
   * 조용히 무시할 여지가 생긴다.
   */
  async assertPassword(organizationId: string, password: string): Promise<void> {
    const stored = await this.load(organizationId);
    if (!stored) {
      throw new BadRequestException(
        '삭제 비밀번호가 설정되지 않았습니다. 설정에서 삭제 비밀번호를 먼저 등록하세요.',
      );
    }
    if (!password || !(await this.matches(stored, password))) {
      throw new ForbiddenException('삭제 비밀번호가 일치하지 않습니다.');
    }
  }

  private async matches(stored: StoredDeletionPassword, password: string): Promise<boolean> {
    const expected = Buffer.from(stored.hash, 'base64');
    const actual = await scryptAsync(
      password,
      Buffer.from(stored.salt, 'base64'),
      stored.keylen,
      stored.cost,
    );
    // 길이가 다르면 timingSafeEqual 이 던진다. 길이 자체는 비밀이 아니므로 먼저 거른다.
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }

  private async load(organizationId: string): Promise<StoredDeletionPassword | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: {
        organizationId_key: { organizationId, key: DELETION_PASSWORD_KEY },
      },
      select: { value: true },
    });
    const value = row?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (
      record.algorithm !== 'scrypt'
      || typeof record.salt !== 'string'
      || typeof record.hash !== 'string'
      || typeof record.keylen !== 'number'
      || typeof record.cost !== 'number'
    ) {
      return null;
    }
    return {
      algorithm: 'scrypt',
      salt: record.salt,
      hash: record.hash,
      keylen: record.keylen,
      cost: record.cost,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    };
  }
}
