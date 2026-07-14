import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

const mockedExecFile = vi.mocked(execFile);

describe('CoupangDirectshipService', () => {
  beforeEach(() => {
    vi.resetModules();
    mockedExecFile.mockReset();
    delete process.env.PYTHON_BIN;
  });

  it('generates the Sellpia workbook through the configured Python runtime', async () => {
    process.env.PYTHON_BIN = '/opt/kiditem-python/bin/python';
    const { CoupangDirectshipService } = await import('./coupang-directship.service');
    const service = new CoupangDirectshipService();

    mockedExecFile.mockImplementation((file, args, _options, callback) => {
      expect(file).toBe('/opt/kiditem-python/bin/python');
      expect(args).toHaveLength(5);

      const [, , inputPath, outputPath, transport] = args as string[];
      const input = JSON.parse(readFileSync(inputPath, 'utf8')) as {
        pos: Array<{ seq?: string; transport?: string }>;
      };
      expect(input.pos).toEqual([
        expect.objectContaining({ seq: 'PO-1', transport: 'SHIPMENT' }),
      ]);
      expect(transport).toBe('SHIPMENT');

      writeFileSync(outputPath, Buffer.from('xls-output'));
      callback?.(null, '{"rows":1}\n', '');
      return {} as ReturnType<typeof execFile>;
    });

    const result = await service.generate({
      transport: 'SHIPMENT',
      pos: [
        {
          seq: 'PO-1',
          center: 'Seoul FC',
          transport: 'SHIPMENT',
          status: 'PA',
          items: [{ name: 'item', qty: 1, amount: 1234 }],
        },
      ],
      centers: {
        'Seoul FC': { addr: 'Seoul', zip: '01234', contact: '+821012345678' },
      },
    });

    expect(result.buffer.toString()).toBe('xls-output');
    expect(result.poCount).toBe(1);
    expect(result.rowCount).toBe(1);
    expect(result.fileName).toMatch(/^쿠팡직배송_쉽먼트_\d{8}\.xls$/);
  });

  it('returns an actionable error when the Python runtime is unavailable', async () => {
    const { CoupangDirectshipService } = await import('./coupang-directship.service');
    const service = new CoupangDirectshipService();

    mockedExecFile.mockImplementation((_file, _args, _options, callback) => {
      callback?.(new Error('spawn python3 ENOENT'), '', '');
      return {} as ReturnType<typeof execFile>;
    });

    await expect(
      service.generate({
        transport: 'MILKRUN',
        pos: [
          {
            seq: 'PO-2',
            center: 'Incheon FC',
            transport: 'MILKRUN',
            status: '발주확정',
            items: [{ name: 'item', qty: 2, amount: 5000 }],
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.generate({
        transport: 'MILKRUN',
        pos: [
          {
            seq: 'PO-2',
            center: 'Incheon FC',
            transport: 'MILKRUN',
            status: '발주확정',
            items: [{ name: 'item', qty: 2, amount: 5000 }],
          },
        ],
      }),
    ).rejects.toThrow('python3 + xlrd/xlwt/xlutils');
  });
});
