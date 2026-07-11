import { describe, it, expect } from 'vitest';
import {
  PRODUCT_OPTION_SYSTEM_FIELDS,
  stripProductOptionSystemFields,
  classifyBundleFlip,
  applyTemporaryReasonClearing,
} from '../product-option-mutation-rules';

describe('PRODUCT_OPTION_SYSTEM_FIELDS', () => {
  it('lists every field that OptionsService.update must NOT accept from the client', () => {
    // SKU generation, organization scope, re-parenting, and soft-delete rules
    // collapse into the single strip list below.
    expect(PRODUCT_OPTION_SYSTEM_FIELDS).toEqual([
      'id',
      'sku',
      'organizationId',
      'masterId',
      'isDeleted',
      'deletedAt',
      'createdAt',
      'updatedAt',
    ]);
  });

  it('contains masterId — guards against IDOR re-parent via PATCH', () => {
    expect(PRODUCT_OPTION_SYSTEM_FIELDS).toContain('masterId');
  });

  it('contains organizationId — guards against cross-organization writes', () => {
    expect(PRODUCT_OPTION_SYSTEM_FIELDS).toContain('organizationId');
  });

  it('contains sku — guards the OptionsService SKU counter invariant', () => {
    expect(PRODUCT_OPTION_SYSTEM_FIELDS).toContain('sku');
  });
});

describe('stripProductOptionSystemFields', () => {
  it('removes every PRODUCT_OPTION_SYSTEM_FIELDS key from the payload', () => {
    const dto = {
      id: 'opt-1',
      sku: 'M-00000001-01',
      organizationId: 'org-1',
      masterId: 'master-evil',
      isDeleted: true,
      deletedAt: new Date('2026-01-01'),
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      // user-editable fields below stay
      optionName: 'Red / S',
      barcode: '8801234567890',
      costPrice: 1000,
      sellPrice: 2500,
    };
    const out = stripProductOptionSystemFields(dto);
    expect(out).toEqual({
      optionName: 'Red / S',
      barcode: '8801234567890',
      costPrice: 1000,
      sellPrice: 2500,
    });
  });

  it('does not mutate the input payload', () => {
    const dto = { sku: 'foo', optionName: 'bar' };
    const snapshot = JSON.parse(JSON.stringify(dto));
    stripProductOptionSystemFields(dto);
    expect(dto).toEqual(snapshot);
  });

  it('returns the same shape when no system fields are present', () => {
    const dto = { optionName: 'A', costPrice: 100 };
    expect(stripProductOptionSystemFields(dto)).toEqual({ optionName: 'A', costPrice: 100 });
  });

  it('returns an empty object when only system fields are present', () => {
    const dto = { sku: 'M-1-01', organizationId: 'org-1' };
    expect(stripProductOptionSystemFields(dto)).toEqual({});
  });

  it('keeps null and undefined user fields intact (they are still legitimate writes)', () => {
    // null = "clear this field"; undefined would normally be dropped by JSON serialization
    // upstream but we should not pre-emptively drop it here.
    const dto = {
      sku: 'system-managed-skip',
      barcode: null,
      optionName: undefined,
      costPrice: 0,
    };
    expect(stripProductOptionSystemFields(dto)).toEqual({
      barcode: null,
      optionName: undefined,
      costPrice: 0,
    });
  });
});

describe('classifyBundleFlip', () => {
  it("returns 'no-change' when DTO does not specify isBundle", () => {
    expect(classifyBundleFlip(true, undefined)).toBe('no-change');
    expect(classifyBundleFlip(false, undefined)).toBe('no-change');
  });

  it("returns 'no-change' when DTO requests the same value", () => {
    expect(classifyBundleFlip(true, true)).toBe('no-change');
    expect(classifyBundleFlip(false, false)).toBe('no-change');
  });

  it("returns 'enable-to-disable' when bundle is being turned off", () => {
    expect(classifyBundleFlip(true, false)).toBe('enable-to-disable');
  });

  it("returns 'disable-to-enable' when bundle is being turned on", () => {
    expect(classifyBundleFlip(false, true)).toBe('disable-to-enable');
  });
});

describe('applyTemporaryReasonClearing', () => {
  it('clears temporaryReason when DTO sets isTemporary=false', () => {
    const result = applyTemporaryReasonClearing(
      { temporaryReason: 'some reason', otherField: 'unchanged' },
      { isTemporary: false },
    );
    expect(result.temporaryReason).toBeNull();
    expect(result.otherField).toBe('unchanged');
  });

  it('leaves data untouched when isTemporary is true', () => {
    const data = { temporaryReason: 'still temporary' };
    const result = applyTemporaryReasonClearing(data, { isTemporary: true });
    expect(result).toEqual(data);
  });

  it('leaves data untouched when isTemporary is undefined', () => {
    const data = { temporaryReason: 'still temporary' };
    const result = applyTemporaryReasonClearing(data, {});
    expect(result).toEqual(data);
  });

  it('does not mutate the input data object', () => {
    const data = { temporaryReason: 'should stay' };
    applyTemporaryReasonClearing(data, { isTemporary: false });
    expect(data.temporaryReason).toBe('should stay');
  });
});
