export const ORDER_STATUSES = {
  ACCEPT:         'ACCEPT',
  INSTRUCT:       'INSTRUCT',
  DEPARTURE:      'DEPARTURE',
  DELIVERING:     'DELIVERING',
  FINAL_DELIVERY: 'FINAL_DELIVERY',
  CANCELED:       'CANCELED',
} as const;

export type OrderStatus = typeof ORDER_STATUSES[keyof typeof ORDER_STATUSES];

export const RETURN_STATUSES = {
  UC: 'UC',
  RC: 'RC',
} as const;

export type ReturnStatus = typeof RETURN_STATUSES[keyof typeof RETURN_STATUSES];
