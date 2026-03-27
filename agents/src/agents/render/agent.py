from __future__ import annotations

import base64
import json

import asyncpg
from rebrowser_playwright.async_api import async_playwright

from src.agents.base import BaseAgent


class RenderAgent(BaseAgent):
    agent_type = "render"

    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict:
        if not task_input:
            raise ValueError("task_input is required")

        html = task_input.get("html", "")
        if not html:
            raise ValueError("html is required")

        png_bytes = await self._render(html)

        return {"png_base64": base64.b64encode(png_bytes).decode()}

    async def _render(self, html: str) -> bytes:
        data_uri = "data:text/html;base64," + base64.b64encode(html.encode()).decode()
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 860, "height": 1200})
            try:
                await page.goto(data_uri, wait_until="networkidle")
                return await page.screenshot(full_page=True)
            finally:
                await browser.close()
