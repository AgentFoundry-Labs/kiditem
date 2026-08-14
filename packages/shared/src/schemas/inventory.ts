export const SELLPIA_WORKBOOK_FILE_EXTENSIONS = ['.xls', '.xlsx', '.csv'] as const;
export type SellpiaWorkbookFileExtension = typeof SELLPIA_WORKBOOK_FILE_EXTENSIONS[number];
export const SELLPIA_WORKBOOK_ACCEPT = SELLPIA_WORKBOOK_FILE_EXTENSIONS.join(',');
export const SELLPIA_WORKBOOK_FORMAT_LABEL = 'XLS/XLSX/CSV';
