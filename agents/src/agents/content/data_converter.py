from __future__ import annotations

from src.agents.content.models import (
    CSInfo,
    DetailPageData,
    ExtensionProductData,
    LayoutConfig,
)


class DataConverter:
    def convert(
        self,
        ext_data: ExtensionProductData,
        *,
        layout: LayoutConfig | None = None,
        hook_text: str = "",
    ) -> DetailPageData:
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
            images=ext_data.images[:10],
            detail_images=ext_data.description_images,
            price=price,
            original_price=original_price,
            discount_rate=discount_rate,
            cs_info=CSInfo(
                refund_rules=[
                    "수령 후 7일 이내 교환/반품 가능",
                    "단순 변심 시 반품 배송비 고객 부담",
                    "상품 하자 시 무료 교환/반품",
                ],
            ),
            layout=layout,
        )
