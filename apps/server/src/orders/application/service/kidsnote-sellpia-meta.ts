// 셀피아 키즈노트 업로드 .xls 의 OLE2 메타데이터 스트림 (WISA 정상 파일에서 추출, 썸네일=고객 미리보기 제거).
// SheetJS .xls 는 SummaryInformation 메타가 없어 셀피아 파서가 거부 → Workbook 과 함께 CFB 재조립해야 읽힌다.
// PII 없음: codepage 949 + 작성자 "Wisa SmartWing" + 생성/수정일 + 보안플래그만 포함. gzip+base64 로 임베드.
import { gunzipSync } from "node:zlib";

const SUMMARY_INFO_GZ = "H4sIAAAAAAAAE13OPY5BAQAE4O8t2bwIiUS/0W2hUaJyAwUJxTZCguL5LxUKDuAEDqCRiMOISJxhOw2WVZlqfpKZud5I+PCOAOfl+vdS6aY3q1Due3fIY4HPV17403GUEaKBJNpIYYgMZjwX9jG+kEa9N2lmq1FzPK33+p1//9HVGkTPvvnop7YMT8GDO26LpfAUxF7f7j0A4q+0AAAA";
const DOC_SUMMARY_INFO_GZ = "H4sIAAAAAAAAE+3PPU5CQRQG0MNPoQhxEhMtSN4GJIalWLoAS0tKS0s7CxoaS5rXEaUgxCh2xgr3QUNig8LjVcgOvCeZmeJLvntn9UND1a4KqvOP+eCinR76B84733kXbzgs80sc4wpnuMYRbpDQwwlucYo7tHC/Pk08bmZgVCNb5/Vydq24U9Gl7Nz3Zmm7x2afl69x/rx4+tRM29KsDKbL2XDy+p4XrZU//wwhhBBCCCGEEP6DXxSEYc8AEAAA";

export const KIDSNOTE_SUMMARY_INFO = gunzipSync(Buffer.from(SUMMARY_INFO_GZ, "base64"));
export const KIDSNOTE_DOC_SUMMARY_INFO = gunzipSync(Buffer.from(DOC_SUMMARY_INFO_GZ, "base64"));
