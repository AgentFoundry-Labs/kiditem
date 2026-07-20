# -*- coding: utf-8 -*-
# 쿠팡직배송 셀피아 주문서 생성 (원본 템플릿 서식 유지 = 색/볼드/너비/시트 5개).
# SheetJS(Node)는 .xls 스타일을 못 써서 Python xlutils 로 생성한다.
# usage: python3 generate.py <template.xls> <input.json> <output.xls> <SHIPMENT|MILKRUN>
# input.json = { "pos": [ {seq, center, transport, edd, reg, items:[{skuId,barcode,name,qty,amount}]} ], "centers": { name: {addr,zip,contact} } }
import json
import sys
import datetime

import xlrd
from xlutils.copy import copy as xlutils_copy

TPL, INP, OUT, TRANSPORT = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
LABEL = {"SHIPMENT": "쉽먼트", "MILKRUN": "밀크런"}.get(TRANSPORT, TRANSPORT)

data = json.load(open(INP, encoding="utf-8"))
centers = data.get("centers", {})
pos = [p for p in data.get("pos", []) if p.get("transport") == TRANSPORT]


def kdate(iso, is_ymd=False):
    try:
        d = datetime.datetime.strptime(iso[:8], "%Y%m%d") if is_ymd else datetime.datetime.strptime(iso[:10], "%Y-%m-%d")
        return "%02d/%02d(%s)" % (d.month, d.day, "월화수목금토일"[d.weekday()])
    except Exception:
        return ""


rb = xlrd.open_workbook(TPL, formatting_info=True)
si = rb.sheet_names().index("Sheet1")
rs = rb.sheet_by_index(si)
wb = xlutils_copy(rb)
ws = wb.get_sheet(si)


def put(r, c, val):
    # 값만 쓰고 해당 셀(복사본 자체)의 기존 xf(색/서식)를 재적용 = 서식 보존.
    cells = ws.row(r)._Row__cells
    old = cells[c].xf_idx if c in cells else (ws.row(2)._Row__cells[c].xf_idx if c in ws.row(2)._Row__cells else None)
    ws.write(r, c, val)
    if old is not None:
        cells[c].xf_idx = old


# 제목: 발주일(최소) → 입고예정일(최소)
regs = sorted([p["reg"] for p in pos if p.get("reg")])
edds = sorted([p["edd"] for p in pos if p.get("edd")])
title = "※%s 쿠팡직배송(%s) 주문 → %s 출고 요청" % (kdate(regs[0]) if regs else "", LABEL, kdate(edds[0]) if edds else "")
for c in range(rs.ncols):
    try:
        if "쿠팡직배송" in str(rs.cell_value(0, c)):
            put(0, c, title)
            break
    except Exception:
        pass

today = datetime.date.today()
serial = (today - datetime.date(1899, 12, 30)).days
R = 2
seq = 0
for po in pos:
    for it in po.get("items", []):
        c = centers.get(po.get("center", ""), {})
        tel = str(c.get("contact", "") or "").replace("+82", "0")
        seq += 1
        put(R, 1, "%s_%02d" % (today.strftime("%Y%m%d"), seq))  # 판매처 주문번호
        put(R, 2, str(po.get("seq", "")))                        # 발주번호
        put(R, 3, po.get("center", ""))                          # 수령자
        put(R, 4, it.get("name", ""))                            # 판매처 상품명
        put(R, 5, int(it.get("qty", 0) or 0))                    # 수량
        put(R, 6, int(it.get("amount", 0) or 0))                 # 결제금액 = 쿠팡 발주금액
        put(R, 7, str(it.get("barcode", "")))                    # 바코드 확인
        put(R, 8, "사입")                                         # 결제수단
        put(R, 9, tel)                                            # 구매자 전화번호(센터)
        put(R, 10, 0)                                             # 배송비
        put(R, 11, 1)                                             # 배송비형태
        zip_ = str(c.get("zip") or "").strip()
        put(R, 12, int(zip_) if zip_ else "")                    # 우편번호
        put(R, 13, c.get("addr", ""))                            # 주소
        put(R, 15, serial)                                       # 주문일
        put(R, 16, tel)                                          # 수취인 전화번호(센터)
        R += 1

wb.save(OUT)
print(json.dumps({"pos": len(pos), "rows": R - 2, "title": title}, ensure_ascii=False))
