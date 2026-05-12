from __future__ import annotations

import asyncio
import pathlib

import httpx


async def download_image(url: str, *, timeout: float = 30.0) -> bytes:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


async def load_image(source: str, *, timeout: float = 30.0) -> bytes:
    if source.startswith(("http://", "https://")):
        return await download_image(source, timeout=timeout)
    path = pathlib.Path(source)
    if path.exists():
        return await asyncio.to_thread(path.read_bytes)
    raise FileNotFoundError(f"Image source not found: {source}")
