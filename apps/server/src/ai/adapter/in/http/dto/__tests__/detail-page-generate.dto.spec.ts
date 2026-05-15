import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  DuplicateRegistrationWorkspaceQueryDto,
  GenerateDetailPageBodyDto,
} from '../index';

async function validationMessages(dto: object): Promise<string[]> {
  const errors = await validate(dto);
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('detail-page generation DTO title validation', () => {
  it('rejects rawTitle values with special characters', async () => {
    const dto = plainToInstance(GenerateDetailPageBodyDto, {
      rawTitle: '키즈@터치등!',
      rawCategory: '',
      rawDescription: '',
      rawOptions: '',
      imageUrls: ['https://example.com/a.jpg'],
    });

    const messages = await validationMessages(dto);

    expect(messages).toContain('상품명은 한글, 영문, 숫자, 공백만 사용할 수 있습니다.');
  });

  it('rejects duplicate-check titles with special characters', async () => {
    const dto = plainToInstance(DuplicateRegistrationWorkspaceQueryDto, {
      title: '키즈@터치등!',
    });

    const messages = await validationMessages(dto);

    expect(messages).toContain('상품명은 한글, 영문, 숫자, 공백만 사용할 수 있습니다.');
  });
});
