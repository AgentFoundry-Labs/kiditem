import type { PrismaClient } from '@prisma/client';

/** Test-only source product fixture; production writes use collection publication. */
export async function seedSourceProduct(
  prisma: PrismaClient,
  input: {
    id?: string;
    organizationId: string;
    code: string;
    name: string;
    optionName?: string | null;
    currentStock?: number;
    purchasePrice?: number | null;
    barcode?: string | null;
    imageUrls?: string[];
  },
) {
  const [{ value }] = await prisma.$queryRaw<Array<{ value: bigint }>>`
    SELECT nextval('kid_item_code_seq'::regclass) AS value
  `;
  return prisma.masterProduct.create({
    data: {
      id: input.id,
      organizationId: input.organizationId,
      code: `KID${value.toString().padStart(8, '0')}`,
      sourceAccountKey: 'kiditem',
      sourceProductCode: input.code,
      sourceOptionCode: '',
      name: input.name,
      optionName: input.optionName ?? null,
      currentStock: input.currentStock ?? 0,
      purchasePrice: input.purchasePrice ?? null,
      barcode: input.barcode ?? null,
      imageUrls: input.imageUrls ?? [],
    },
  });
}
