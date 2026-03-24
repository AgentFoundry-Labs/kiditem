from __future__ import annotations

from collections.abc import Mapping

import structlog

from src.agents.content.models import (
    CSInfo,
    DetailPageData,
    ExtensionProductData,
    FeatureItem,
    KeyPointItem,
    LayoutConfig,
    MaterialItem,
    SpecItem,
)

logger = structlog.get_logger()

_SPEC_KEY_ZH_KO: dict[str, str | None] = {
    "品牌": "브랜드",
    "材质": "소재",
    "面料": "원단",
    "填充材料": "충전재",
    "填充物": "충전재",
    "颜色": "색상",
    "颜色分类": "색상",
    "尺寸": "사이즈",
    "尺码": "사이즈",
    "高度": "높이",
    "重量": "무게",
    "产地": "생산지",
    "适用年龄": "권장 연령",
    "适用人群": "대상",
    "功能": "기능",
    "风格": "스타일",
    "包装": "포장",
    "笔类型": "펜 종류",
    "笔头规格": "펜촉 규격",
    "墨水颜色": "잉크 색상",
    "包装方式": "포장 방식",
    "单支重量": "개당 무게",
    "是否跨境出口专供": None,
    "外贸专供": None,
    "主要下游平台": None,
    "下游平台": None,
    "是否有引导视频": None,
    "专利类型": None,
    "加工方式": None,
    "货号": None,
    "3C配置类别": None,
    "3C证书编号": None,
}

_SPEC_VALUE_ZH_KO: dict[str, str] = {
    "PP棉": "PP솜",
    "毛绒玩具": "봉제인형",
    "短毛绒": "극세사",
    "水晶超柔": "크리스탈 벨보아",
    "公仔": "캐릭터 인형",
    "中国": "중국",
    "义乌": "이우",
    "浙江": "저장성",
    "广东": "광동성",
}


def _translate_spec_text(text: str, table: Mapping[str, str | None]) -> str:
    for zh, ko in table.items():
        if ko is not None and zh in text:
            text = text.replace(zh, ko)
    return text


class DataConverter:
    def convert(
        self,
        ext_data: ExtensionProductData,
        *,
        layout: LayoutConfig | None = None,
        hook_text: str = "",
        hook_subtext: str = "",
    ) -> DetailPageData:
        specs: list[SpecItem] = []
        for s in list(ext_data.specs) + list(ext_data.pack_info):
            translated_key = _SPEC_KEY_ZH_KO.get(s.key)
            if translated_key is None and s.key in _SPEC_KEY_ZH_KO:
                continue
            key = translated_key if translated_key else _translate_spec_text(s.key, _SPEC_KEY_ZH_KO)
            value = _translate_spec_text(s.value, _SPEC_VALUE_ZH_KO)
            specs.append(SpecItem(key=key, value=value))

        price = int(ext_data.price_min) if ext_data.price_min else None
        original_price = None
        discount_rate = None
        if ext_data.price_max and ext_data.price_min and ext_data.price_max > ext_data.price_min:
            original_price = int(ext_data.price_max)
            if price and original_price:
                discount_rate = int((1 - price / original_price) * 100)

        subtitle_parts = [p for p in [ext_data.supplier_name, ext_data.category_name] if p]

        effective_hook = hook_text
        if not effective_hook:
            if ext_data.description and ext_data.description != ext_data.title:
                effective_hook = ext_data.description[:60]
            elif ext_data.category_name:
                effective_hook = f"{ext_data.category_name} 인기상품"
            else:
                effective_hook = ext_data.title

        return DetailPageData(
            title=ext_data.title,
            subtitle=" | ".join(subtitle_parts) if subtitle_parts else "",
            description=[ext_data.description or ext_data.title],
            hook_text=effective_hook,
            hook_subtext=hook_subtext or ext_data.description or "",
            images=ext_data.images[:10],
            detail_images=ext_data.description_images,
            price=price,
            original_price=original_price,
            discount_rate=discount_rate,
            specs=specs,
            features=self._extract_features(ext_data),
            key_points=self._extract_key_points(ext_data),
            materials=self._extract_materials(ext_data),
            cs_info=CSInfo(
                phone="",
                kakao="",
                refund_rules=[
                    "수령 후 7일 이내 교환/반품 가능",
                    "단순 변심 시 반품 배송비 고객 부담",
                    "상품 하자 시 무료 교환/반품",
                ],
            ),
            layout=layout,
        )

    def _extract_features(self, ext_data: ExtensionProductData) -> list[FeatureItem]:
        features: list[FeatureItem] = []
        if ext_data.moq:
            features.append(
                FeatureItem(
                    icon="📦",
                    title=f"최소주문 {ext_data.moq}{ext_data.unit or '개'}",
                    description="대량 구매 시 할인 가능",
                )
            )
        if ext_data.supplier_years:
            features.append(
                FeatureItem(
                    icon="🏭",
                    title=f"공급업체 {ext_data.supplier_years}",
                    description=ext_data.supplier_name or "검증된 공급업체",
                )
            )
        if ext_data.good_rates is not None and ext_data.good_rates > 0:
            features.append(
                FeatureItem(
                    icon="⭐",
                    title=f"호평률 {ext_data.good_rates}%",
                    description="구매자 만족도 높은 상품",
                )
            )
        if ext_data.verified_badges:
            features.append(
                FeatureItem(
                    icon="✅",
                    title="인증 공급업체",
                    description=", ".join(ext_data.verified_badges[:3]),
                )
            )
        return features

    def _extract_key_points(self, ext_data: ExtensionProductData) -> list[KeyPointItem]:
        key_points: list[KeyPointItem] = []
        imgs = ext_data.description_images
        point_configs = [
            ("상품 상세", "고품질 상품 상세 이미지를 확인하세요."),
            ("디테일 컷", "상품의 디테일을 꼼꼼하게 확인하세요."),
            ("추가 정보", "더 많은 상품 정보를 확인하세요."),
        ]
        for i, (title, desc) in enumerate(point_configs):
            start = i * 2
            if start + 1 < len(imgs):
                key_points.append(
                    KeyPointItem(
                        number=i + 1,
                        title=title,
                        description=desc,
                        images=imgs[start : start + 2],
                    )
                )
        return key_points

    def _extract_materials(self, ext_data: ExtensionProductData) -> list[MaterialItem]:
        materials: list[MaterialItem] = []
        material_keywords = {
            "材质",
            "소재",
            "material",
            "面料",
            "원단",
            "填充材料",
            "填充物",
            "충전재",
        }
        for spec in ext_data.specs:
            if any(kw in spec.key.lower() for kw in material_keywords):
                key = _SPEC_KEY_ZH_KO.get(spec.key, spec.key)
                if key is None:
                    continue
                value = _translate_spec_text(spec.value, _SPEC_VALUE_ZH_KO)
                materials.append(MaterialItem(title=key, description=value))
        return materials
