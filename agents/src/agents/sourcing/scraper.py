"""Server-side product scraper using rebrowser-playwright.

Launches a headless browser, navigates to 1688/Alibaba product pages,
and extracts product data by injecting extractor JS.

Ported from e-commerce-system. No DB queries — pure extraction.
"""

from __future__ import annotations

import pathlib

import structlog

try:
    from rebrowser_playwright.async_api import async_playwright
except ImportError:
    async_playwright = None

logger = structlog.get_logger()

_EXTENSION_DIR = pathlib.Path(__file__).resolve().parents[4] / "extensions" / "product-scraper"

_NAVIGATE_TIMEOUT_MS = 30_000
_DATA_WAIT_TIMEOUT_MS = 15_000
_SCROLL_PAUSE_MS = 500

_DATA_READY_CHECK = """
() => {
    if (window.context && window.context.result) return 'context';
    if (window.__INIT_DATA__ && window.__INIT_DATA__.globalData) return '__INIT_DATA__';
    if (window.detailData && window.detailData.globalData) return 'detailData';
    return false;
}
"""


def _detect_platform(url: str) -> str | None:
    if "1688.com" in url:
        return "1688"
    if "alibaba.com" in url:
        return "ALIBABA"
    return None


def _load_extractor_js(platform: str) -> tuple[str, str, str]:
    common = (_EXTENSION_DIR / "extractors" / "common.js").read_text(encoding="utf-8")
    if platform == "1688":
        platform_js = (_EXTENSION_DIR / "extractors" / "1688.js").read_text(encoding="utf-8")
        bridge_js = (_EXTENSION_DIR / "extractors" / "1688-bridge.js").read_text(encoding="utf-8")
    else:
        platform_js = (_EXTENSION_DIR / "extractors" / "alibaba.js").read_text(encoding="utf-8")
        bridge_js = (_EXTENSION_DIR / "extractors" / "page-bridge.js").read_text(encoding="utf-8")
    return common, platform_js, bridge_js


_EXTRACT_RUNNER = """
() => {
    let bridgeData = null;

    if (window.context && window.context.result) {
        const r = window.context.result;
        if (r.global && r.global.globalData && r.global.globalData.model) {
            const m = r.global.globalData.model;
            const od = m.offerDetail || {};
            const tm = m.tradeModel || {};
            const sm = m.sellerModel || {};
            const db = m.detailBusiness || {};
            const dd = m.detailDescription || {};
            const descFields = ((r.data || {}).description || {}).fields || {};
            const packFields = ((r.data || {}).productPackInfo || {}).fields || {};
            bridgeData = {
                modelData: {
                    subject: od.subject || "",
                    offerId: od.offerId || "",
                    images: (od.imageList || []).map(i => i.fullPathImageURI || "").filter(Boolean),
                    mainImages: (od.mainImageList || []).map(i => i.fullPathImageURI || "").filter(Boolean),
                    featureAttributes: (od.featureAttributes || [])
                        .map(a => ({ name: a.name || "", value: a.value || "" }))
                        .filter(a => a.name && a.value),
                    skuProps: (od.skuProps || []).map(p => ({
                        prop: p.prop || "",
                        values: (p.value || []).map(v => ({ name: v.name || "", imageUrl: v.imageUrl || "" })),
                    })),
                    categoryId: od.leafCategoryId || "",
                    categoryName: od.leafCategoryName || "",
                    video: od.wirelessVideo
                        ? {
                            coverUrl: od.wirelessVideo.coverUrl || "",
                            videoUrl: (od.wirelessVideo.videoUrls || {}).android || "",
                            title: od.wirelessVideo.title || "",
                        }
                        : null,
                    detailUrl: od.detailUrl || descFields.detailUrl || "",
                    status: od.status || "",
                    minPrice: tm.minPrice || "",
                    maxPrice: tm.maxPrice || "",
                    beginAmount: tm.beginAmount || 1,
                    unit: tm.unit || "",
                    saleCount: tm.saleCount || 0,
                    currentPrices: (tm.offerPriceModel || {}).currentPrices || [],
                    skuMap: (tm.skuMap || []).map(s => ({
                        skuId: s.skuId || "",
                        specAttrs: s.specAttrs || "",
                        price: s.price || "",
                        discountPrice: s.discountPrice || "",
                        canBookCount: s.canBookCount || 0,
                        saleCount: s.saleCount || 0,
                    })),
                    mixModel: tm.mixModel || null,
                    companyName: sm.companyName || "",
                    loginId: sm.loginId || "",
                    userId: sm.userId || "",
                    winportUrl: sm.winportUrl || "",
                    goodRates: (db.rateInfo || {}).goodRates || null,
                    goodsGrade: (db.rateInfo || {}).goodsGrade || null,
                    favorCount: db.favorCount || 0,
                    shopBaseInfo: db.shopBaseInfo || {},
                    freightInfo: dd.freightInfo || {},
                    packAttributes: od.packAttributes || [],
                    packInfo: packFields,
                    unitWeight: od.unitWeight || packFields.unitWeight || (dd.freightInfo || {}).unitWeight || null,
                },
            };
        }

        if (!bridgeData && r.data) {
            const rd = r.data;
            const pt = (rd.productTitle || {}).fields || {};
            const mp = (rd.mainPrice || {}).fields || {};
            const gal = (rd.gallery || {}).fields || {};
            const desc = (rd.description || {}).fields || {};
            const ppi = (rd.productPackInfo || {}).fields || {};
            bridgeData = {
                contextData: {
                    title: pt.title || "",
                    saleNum: pt.saleNum || "",
                    unit: mp.unit || pt.unit || "",
                    priceModel: mp.priceModel || {},
                    finalPriceModel: mp.finalPriceModel || {},
                    originalPricesWithoutPromotion: mp.originalPricesWithoutPromotion || [],
                    mainImage: gal.mainImage || [],
                    offerImgList: gal.offerImgList || [],
                    offerId: gal.offerId || "",
                    subject: gal.subject || "",
                    video: gal.video || null,
                    detailUrl: desc.detailUrl || "",
                    packInfo: ppi,
                },
            };
        }
    }

    if (!bridgeData && window.__INIT_DATA__ && window.__INIT_DATA__.globalData) {
        const g = window.__INIT_DATA__.globalData;
        bridgeData = {
            globalData: {
                tempModel: g.tempModel || {},
                images: g.images || [],
                skuModel: g.skuModel || {},
                orderParamModel: g.orderParamModel || {},
            },
        };
    }

    if (!bridgeData && window.detailData && window.detailData.globalData) {
        const g = window.detailData.globalData;
        bridgeData = {
            globalData: {
                product: g.product || {},
                seller: g.seller || {},
                trade: g.trade || {},
                certification: g.certification || {},
                certificationLogos: g.certificationLogos || [],
            },
        };
    }

    const platform = ProductScraper.common.detectPlatform();
    if (!platform) return null;

    const extractors = {
        ALIBABA: ProductScraper.alibaba,
        "1688": ProductScraper.alibaba1688,
    };
    const extractor = extractors[platform];
    if (!extractor) return null;

    const data = extractor.extract(bridgeData);
    return data;
}
"""

_DESC_FETCH_JS = """
(detailUrl) => {
    return fetch(detailUrl)
        .then(resp => resp.ok ? resp.text() : null)
        .then(html => {
            if (!html) return null;

            let content = html;
            const marker = "var offer_details=";
            const idx = html.indexOf(marker);
            if (idx !== -1) {
                const start = idx + marker.length;
                let depth = 0, inStr = false, esc = false, end = -1;
                for (let i = start; i < html.length; i++) {
                    const c = html.charAt(i);
                    if (esc) { esc = false; continue; }
                    if (c === "\\\\") { esc = true; continue; }
                    if (c === '"') { inStr = !inStr; continue; }
                    if (inStr) continue;
                    if (c === "{") depth++;
                    if (c === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
                }
                if (end > start) {
                    try {
                        const parsed = JSON.parse(html.substring(start, end));
                        if (parsed.content) content = parsed.content;
                    } catch (e) {}
                }
            }

            const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
            const images = [];
            let m;
            while ((m = imgRe.exec(content)) !== null) {
                const src = m[1];
                if (src.startsWith("data:") || src.includes("icon") || src.includes("logo")) continue;
                const full = src.startsWith("//") ? "https:" + src : src;
                if (!images.includes(full)) images.push(full);
            }

            const textRe = /<(?:p|h[1-6]|li|td|th|div|span)[^>]*>([^<]{5,})<\\//gi;
            const texts = [];
            const seen = {};
            while ((m = textRe.exec(content)) !== null) {
                const t = m[1].replace(/&[^;]+;/g, " ").trim();
                if (t.length < 5 || t.length > 2000 || seen[t]) continue;
                seen[t] = true;
                texts.push(t);
            }

            if (images.length === 0 && texts.length === 0) return null;
            return {
                description_images: images,
                description_text: texts.join("\\n").slice(0, 10000),
                description_image_count: images.length,
            };
        })
        .catch(() => null);
}
"""


async def scrape_product_url(url: str) -> dict | None:
    platform = _detect_platform(url)
    if not platform:
        return None

    common_js, platform_js, _ = _load_extractor_js(platform)

    logger.info("scraper_starting", url=url, platform=platform)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        try:
            page = await browser.new_page(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1920, "height": 1080},
            )
            await page.goto(url, wait_until="domcontentloaded", timeout=_NAVIGATE_TIMEOUT_MS)

            try:
                handle = await page.wait_for_function(
                    _DATA_READY_CHECK, timeout=_DATA_WAIT_TIMEOUT_MS
                )
                data_source = await handle.json_value()
                logger.info("scraper_data_ready", source=data_source, url=url)
            except Exception:
                page_title = await page.title()
                logger.warning("scraper_data_wait_timeout", url=url, title=page_title)

            await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
            await page.wait_for_timeout(_SCROLL_PAUSE_MS)
            await page.evaluate("window.scrollTo(0, 0)")
            await page.wait_for_timeout(_SCROLL_PAUSE_MS)

            await page.evaluate(common_js)
            await page.evaluate(platform_js)

            data = await page.evaluate(_EXTRACT_RUNNER)

            if not data:
                logger.warning("scraper_no_data", url=url)
                return None

            detail_url = data.get("_detail_url", "")
            if detail_url and platform == "1688":
                desc = await page.evaluate(_DESC_FETCH_JS, detail_url)
                if desc:
                    data["description_images"] = desc["description_images"]
                    data["description_text"] = desc["description_text"]
                    data["description_image_count"] = desc["description_image_count"]

            data.pop("_detail_url", None)
            data.pop("_extraction_method", None)

            logger.info(
                "scraper_done",
                url=url,
                title=data.get("title", "")[:80],
                images=len(data.get("images", [])),
            )
            return data

        finally:
            await browser.close()
