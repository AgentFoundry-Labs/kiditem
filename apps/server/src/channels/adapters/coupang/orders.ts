// Compatibility shim — orders module imports from this path. Real implementation
// lives at adapter/out/coupang/orders.ts (Wave H2 Lane C).
export {
  getOrderSheets,
  confirmOrderSheets,
  uploadInvoice,
  approveReturn,
  DELIVERY_COMPANIES,
} from '../../adapter/out/coupang/orders';
