import { coupangRequest, type CoupangCredentials } from './coupang-client';

// ===== 발주서(주문) =====

export async function getOrderSheets(credentials: CoupangCredentials, params: {
  createdAtFrom: string;
  createdAtTo: string;
  status?: string;
  maxPerPage?: number;
  nextToken?: string;
}) {
  const query: Record<string, string> = {
    createdAtFrom: params.createdAtFrom,
    createdAtTo: params.createdAtTo,
  };
  if (params.status) query.status = params.status;
  if (params.maxPerPage) query.maxPerPage = String(params.maxPerPage);
  if (params.nextToken) query.nextToken = params.nextToken;

  return coupangRequest({
    method: 'GET',
    credentials,
    path: `/v2/providers/openapi/apis/api/v4/vendors/${credentials.vendorId}/ordersheets`,
    query,
  });
}

export async function confirmOrderSheets(
  credentials: CoupangCredentials,
  shipmentBoxIds: number[],
) {
  return coupangRequest({
    method: 'PUT',
    credentials,
    path: `/v2/providers/openapi/apis/api/v4/vendors/${credentials.vendorId}/ordersheets/acknowledgement`,
    body: { shipmentBoxIds },
  });
}

export async function uploadInvoice(
  credentials: CoupangCredentials,
  shipmentBoxId: number,
  params: {
    deliveryCompanyCode: string;
    invoiceNumber: string;
  },
) {
  return coupangRequest({
    method: 'PUT',
    credentials,
    path: `/v2/providers/openapi/apis/api/v4/vendors/${credentials.vendorId}/ordersheets/${shipmentBoxId}/invoiceNumber`,
    body: {
      vendorId: credentials.vendorId,
      shipmentBoxId,
      deliveryCompanyCode: params.deliveryCompanyCode,
      invoiceNumber: params.invoiceNumber,
    },
  });
}

// ===== 반품 =====

export async function approveReturn(credentials: CoupangCredentials, receiptId: number) {
  return coupangRequest({
    method: 'PUT',
    credentials,
    path: `/v2/providers/openapi/apis/api/v4/vendors/${credentials.vendorId}/returnRequests/${receiptId}/approval`,
  });
}

// ===== 교환 =====

// ===== 택배사 코드 =====

export const DELIVERY_COMPANIES = [
  { code: 'CJGLS', name: 'CJ대한통운' },
  { code: 'KGB', name: '로젠택배' },
  { code: 'EPOST', name: '우체국택배' },
  { code: 'HANJIN', name: '한진택배' },
  { code: 'HYUNDAI', name: '현대택배 (롯데)' },
  { code: 'KDEXP', name: '경동택배' },
  { code: 'CHUNIL', name: '천일택배' },
  { code: 'CVSNET', name: 'GS편의점택배' },
  { code: 'DAESIN', name: '대신택배' },
  { code: 'HDEXP', name: '합동택배' },
  { code: 'ILYANG', name: '일양로지스' },
  { code: 'REGISTPOST', name: '우편등기' },
] as const;
