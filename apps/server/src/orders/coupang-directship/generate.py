# -*- coding: utf-8 -*-
# 쿠팡직배송 셀피아 주문서 생성.
#
# 셀피아에 올리는 건 헤더 한 줄 + 주문 행이 전부다. 예전에는 원본 템플릿(.xls)의
# 노란/녹색 서식과 시트 5개를 그대로 물려받았는데, 그 템플릿에는 예시 주문 1행과
# 삭제된 참조 시트를 가리키는 #REF! 수식 행이 38행까지 남아 있어 셀피아에 남의
# 발주가 함께 등록될 위험이 있었다. 그래서 템플릿을 쓰지 않고 서식 없는 단일 시트로
# 직접 만든다.
#
# usage: python3 generate.py <template.xls> <input.json> <output.xls> <SHIPMENT|MILKRUN>
#   template.xls 인자는 호출부 호환을 위해 받기만 하고 쓰지 않는다.
# input.json = { "pos": [ {seq, center, transport, edd, reg, items:[{skuId,barcode,name,qty,amount}]} ],
#                "centers": { name: {addr,zip,contact} } }
import json
import sys
import datetime

import xlwt

TPL, INP, OUT, TRANSPORT = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

data = json.load(open(INP, encoding="utf-8"))
centers = data.get("centers", {})
pos = [p for p in data.get("pos", []) if p.get("transport") == TRANSPORT]

HEADERS = [
    "주문자",
    "판매처 주문번호\n(예,20221115_0001)",
    "발주번호",
    "수령자",
    "판매처 상품명",
    "수량",
    "결제금액",
    "바코드 확인",
    "결제수단",
    "구매자 전화번호",
    "배송비",
    "배송비형태",
    "우편번호",
    "주소",
    "나머지 주소",
    "주문일",
    "수취인 전화번호",
]
# 셀피아가 읽는 폭. 주소(13)와 수취인 전화번호(16)만 넓다.
WIDTHS = {13: 8064, 16: 4064}
DEFAULT_WIDTH = 2048


def phone(raw):
    """센터 연락처를 셀피아 양식대로 하이픈 형태로 만든다. (+8270… -> 070-…)"""
    d = "".join(ch for ch in str(raw or "").replace("+82", "0") if ch.isdigit())
    if len(d) == 11:
        return "%s-%s-%s" % (d[:3], d[3:7], d[7:])
    if len(d) == 10:
        return "%s-%s-%s" % (d[:3], d[3:6], d[6:])
    return d

wb = xlwt.Workbook(encoding="utf-8")
ws = wb.add_sheet("Sheet1")
base = xlwt.easyxf("font: name 맑은 고딕")

for c, title in enumerate(HEADERS):
    ws.write(0, c, title, base)
    ws.col(c).width = WIDTHS.get(c, DEFAULT_WIDTH)

today = datetime.date.today()
serial = (today - datetime.date(1899, 12, 30)).days
R = 1
seq = 0
for po in pos:
    for it in po.get("items", []):
        c = centers.get(po.get("center", ""), {})
        tel = phone(c.get("contact"))
        seq += 1
        zip_ = str(c.get("zip") or "").strip()
        ws.write(R, 1, "%s_%04d" % (today.strftime("%Y%m%d"), seq), base)  # 판매처 주문번호
        ws.write(R, 2, str(po.get("seq", "")), base)                       # 발주번호
        ws.write(R, 3, po.get("center", ""), base)                         # 수령자
        ws.write(R, 4, it.get("name", ""), base)                           # 판매처 상품명
        ws.write(R, 5, str(int(it.get("qty", 0) or 0)), base)              # 수량
        ws.write(R, 6, int(it.get("amount", 0) or 0), base)                # 결제금액 = 쿠팡 발주금액
        ws.write(R, 7, str(it.get("barcode", "")), base)                   # 바코드 확인
        ws.write(R, 8, "사입", base)                                        # 결제수단
        ws.write(R, 9, tel, base)                                          # 구매자 전화번호(센터)
        ws.write(R, 10, 0, base)                                           # 배송비
        ws.write(R, 11, 1, base)                                           # 배송비형태
        ws.write(R, 12, int(zip_) if zip_ else "", base)                   # 우편번호
        ws.write(R, 13, c.get("addr", ""), base)                           # 주소
        ws.write(R, 15, serial, base)                                      # 주문일
        ws.write(R, 16, tel, base)                                         # 수취인 전화번호(센터)
        R += 1

wb.save(OUT)
print(json.dumps({"pos": len(pos), "rows": R - 1, "sheets": ["Sheet1"]}, ensure_ascii=False))
