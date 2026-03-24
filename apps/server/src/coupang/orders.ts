import { coupangRequest, getVendorId } from './client';

// ===== 발주서(주문) =====

export async function getOrderSheets(params: {
  createdAtFrom: string;
  createdAtTo: string;
  status?: string;
  maxPerPage?: number;
  nextToken?: string;
}) {
  const vendorId = getVendorId();
  const query: Record<string, string> = {
    createdAtFrom: params.createdAtFrom,
    createdAtTo: params.createdAtTo,
  };
  if (params.status) query.status = params.status;
  if (params.maxPerPage) query.maxPerPage = String(params.maxPerPage);
  if (params.nextToken) query.nextToken = params.nextToken;

  return coupangRequest({
    method: 'GET',
    path: `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets`,
    query,
  });
}

export async function confirmOrderSheets(shipmentBoxIds: number[]) {
  const vendorId = getVendorId();
  return coupangRequest({
    method: 'PUT',
    path: `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets/acknowledgement`,
    body: { shipmentBoxIds },
  });
}

export async function uploadInvoice(
  shipmentBoxId: number,
  params: {
    deliveryCompanyCode: string;
    invoiceNumber: string;
  },
) {
  const vendorId = getVendorId();
  return coupangRequest({
    method: 'PUT',
    path: `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets/${shipmentBoxId}/invoiceNumber`,
    body: {
      vendorId,
      shipmentBoxId,
      deliveryCompanyCode: params.deliveryCompanyCode,
      invoiceNumber: params.invoiceNumber,
    },
  });
}

// ===== 반품 =====

export async function getReturnRequests(params: {
  createdAtFrom: string;
  createdAtTo: string;
  status?: string;
}) {
  const vendorId = getVendorId();
  const query: Record<string, string> = {
    createdAtFrom: params.createdAtFrom,
    createdAtTo: params.createdAtTo,
  };
  if (params.status) query.status = params.status;

  return coupangRequest({
    method: 'GET',
    path: `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/returnRequests`,
    query,
  });
}

export async function approveReturn(receiptId: number) {
  const vendorId = getVendorId();
  return coupangRequest({
    method: 'PUT',
    path: `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/returnRequests/${receiptId}/approval`,
  });
}

// ===== 교환 =====

export async function getExchangeRequests(params: {
  createdAtFrom: string;
  createdAtTo: string;
  status?: string;
}) {
  const vendorId = getVendorId();
  const query: Record<string, string> = {
    createdAtFrom: params.createdAtFrom,
    createdAtTo: params.createdAtTo,
  };
  if (params.status) query.status = params.status;

  return coupangRequest({
    method: 'GET',
    path: `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/exchangeRequests`,
    query,
  });
}

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
