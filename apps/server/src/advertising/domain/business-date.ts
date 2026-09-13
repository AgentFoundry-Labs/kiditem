// Compatibility surface for advertising callers. The canonical implementation
// lives in shared/common so server and web consume one business-date contract.
export {
  currentBusinessDate,
  resolveBusinessDate,
  toBusinessDate,
} from '@kiditem/shared/common';
