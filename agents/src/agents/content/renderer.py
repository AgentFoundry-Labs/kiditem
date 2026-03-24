from __future__ import annotations

import base64
import uuid

import structlog
from rebrowser_playwright.async_api import async_playwright

from src.agents.content.paths import PAGES_DIR

logger = structlog.get_logger()


class PageRenderer:
    def __init__(self) -> None:
        PAGES_DIR.mkdir(parents=True, exist_ok=True)

    async def render_to_image(self, html: str) -> str:
        png_bytes = await self.render_to_image_bytes(html)
        output_path = PAGES_DIR / f"{uuid.uuid4()}_detail.png"
        output_path.write_bytes(png_bytes)
        logger.info("Rendered HTML to image", output_path=str(output_path))
        return str(output_path)

    async def render_to_image_bytes(self, html: str, *, base_url: str = "") -> bytes:
        if base_url:
            base_tag = f'<base href="{base_url}">'
            if "<head>" in html:
                html = html.replace("<head>", f"<head>{base_tag}", 1)
            else:
                html = base_tag + html
        data_uri = "data:text/html;base64," + base64.b64encode(html.encode()).decode()
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(
                viewport={"width": 860, "height": 1200},
            )
            try:
                await page.goto(data_uri, wait_until="networkidle")
                return await page.screenshot(full_page=True)
            finally:
                await browser.close()
