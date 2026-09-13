import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AdTrendExportDto } from './ad-export.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });

function trendBody(point: Record<string, unknown>) {
  return {
    period: '7d',
    leftMetric: 'spend',
    rightMetric: 'roas',
    leftLabel: '집행 광고비',
    rightLabel: '광고 수익률(ROAS)',
    points: [{ businessDate: '2026-07-01', axisLabel: '07/01(수)', ...point }],
  };
}

describe('AdTrendExportDto', () => {
  it('accepts an unmeasured date as null values rather than requiring a fabricated 0', async () => {
    const dto = (await pipe.transform(trendBody({ leftValue: null, rightValue: null }), {
      type: 'body',
      metatype: AdTrendExportDto,
    })) as AdTrendExportDto;

    expect(dto.points[0]).toMatchObject({ leftValue: null, rightValue: null });
  });

  it('keeps a measured zero and still rejects a non-numeric value', async () => {
    const dto = (await pipe.transform(trendBody({ leftValue: 0, rightValue: 12.5 }), {
      type: 'body',
      metatype: AdTrendExportDto,
    })) as AdTrendExportDto;
    expect(dto.points[0]).toMatchObject({ leftValue: 0, rightValue: 12.5 });

    await expect(pipe.transform(trendBody({ leftValue: 'abc', rightValue: 1 }), {
      type: 'body',
      metatype: AdTrendExportDto,
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
