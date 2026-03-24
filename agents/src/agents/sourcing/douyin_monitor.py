"""Douyin live room monitor — WebSocket client + room management.

Merged from e-commerce-system's monitor.py + client.py.
All DB access uses asyncpg raw SQL against the kiditem schema.

NOTE: The protobuf decoder (decoder.py, proto/) and product_fetcher
must be ported separately to enable full WebSocket message parsing.
This module provides the connection/room management infrastructure.
"""

from __future__ import annotations

import asyncio
import logging
import random
import re
import string
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote, urlencode

import asyncpg
import httpx
import websockets
from websockets.asyncio.client import ClientConnection

from src import config as cfg

logger = logging.getLogger(__name__)

MessageCallback = Callable[[str, Any, str], Awaitable[None]]

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
_LIVE_BASE = "https://live.douyin.com"
_LIVE_URL_PATTERN = re.compile(r"live\.douyin\.com/(\d+)")


def _random_ms_token(length: int = 182) -> str:
    chars = string.ascii_letters + string.digits + "_-"
    return "".join(random.choices(chars, k=length))


async def gen_ttwid() -> str:
    async with httpx.AsyncClient(follow_redirects=True) as client:
        resp = await client.get(
            _LIVE_BASE,
            headers={"User-Agent": _USER_AGENT},
            cookies={"__ac_nonce": "0" * 21},
        )
        ttwid = resp.cookies.get("ttwid", "")
        if not ttwid:
            for cookie in resp.cookies.jar:
                if cookie.name == "ttwid":
                    ttwid = cookie.value
                    break
        if not ttwid:
            raise RuntimeError("Failed to obtain ttwid from live.douyin.com")
        return ttwid


async def resolve_room_info(web_room_id: str, ttwid: str) -> tuple[str, str]:
    async with httpx.AsyncClient(follow_redirects=True) as client:
        resp = await client.get(
            f"{_LIVE_BASE}/{web_room_id}",
            headers={"User-Agent": _USER_AGENT},
            cookies={
                "ttwid": ttwid,
                "msToken": _random_ms_token(),
                "__ac_nonce": "0" * 21,
            },
        )
        html = resp.text

    room_match = re.search(r'roomId\\":\\"(\d+)\\"', html)
    if not room_match:
        room_match = re.search(r'"roomId":"(\d+)"', html)
    if not room_match:
        raise ValueError(f"Cannot extract roomId from live page: {web_room_id}")
    room_id = room_match.group(1)

    name_match = re.search(r'"nickname":"([^"]+)"', html)
    streamer_name = name_match.group(1) if name_match else ""

    return room_id, streamer_name


def _build_ws_url(room_id: str, ttwid: str) -> str:
    push_id = "".join(random.choices(string.digits, k=19))
    params = {
        "app_name": "douyin_web",
        "version_code": "180800",
        "webcast_sdk_version": "1.0.14-beta.0",
        "update_version_code": "1.0.14-beta.0",
        "compress": "gzip",
        "device_platform": "web",
        "cookie_enabled": "true",
        "screen_width": "1920",
        "screen_height": "1080",
        "browser_language": "zh-CN",
        "browser_platform": "Win32",
        "browser_name": "Mozilla",
        "browser_version": quote(_USER_AGENT),
        "browser_online": "true",
        "tz_name": "Asia/Shanghai",
        "cursor": "d-1_u-1_fh-7383580261740818238_t-1721406256927_r-1",
        "internal_ext": (
            f"internal_src:dim|wss_push_room_id:{room_id}"
            f"|wss_push_did:{push_id}"
            "|dim_log_id:20240720010416E8C3E4035DBF0E6149A9"
            "|first_req_ms:0|fetch_time:0|seq:1|wss_info:0-0-0-0"
            "|wrds_kvs:WebcastRoomRankMessage-0_WebcastRoomStatsMessage-0"
        ),
        "host": "https://live.douyin.com",
        "aid": "6383",
        "live_id": "1",
        "did_rule": "3",
        "endpoint": "live_pc",
        "support_wrds": "1",
        "user_unique_id": push_id,
        "im_path": "/webcast/im/fetch/",
        "identity": "audience",
        "need_persist_msg_count": "15",
        "insert_task_id": "",
        "live_reason": "",
        "room_id": room_id,
        "heartbeatDuration": "0",
    }
    return f"{cfg.DOUYIN_WS_URL}?{urlencode(params)}"


class DouyinLiveClient:
    def __init__(
        self,
        room_id: str,
        web_room_id: str,
        ttwid: str,
        on_message: MessageCallback | None = None,
    ) -> None:
        self.room_id = room_id
        self.web_room_id = web_room_id
        self._ttwid = ttwid
        self._on_message = on_message
        self._ws: ClientConnection | None = None
        self._running = False
        self._heartbeat_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._running = True
        reconnect_delay = cfg.DOUYIN_RECONNECT_DELAY

        while self._running:
            try:
                await self._connect_and_listen()
            except Exception:
                if not self._running:
                    break
                logger.warning(
                    "Room disconnected, reconnecting room_id=%s delay=%.1f",
                    self.room_id,
                    reconnect_delay,
                    exc_info=True,
                )
                await asyncio.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 1.5, 30.0)

    async def stop(self) -> None:
        self._running = False
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
        if self._ws:
            await self._ws.close()

    async def _connect_and_listen(self) -> None:
        ws_url = _build_ws_url(self.room_id, self._ttwid)
        extra_headers = {
            "User-Agent": _USER_AGENT,
            "Cookie": f"ttwid={self._ttwid}",
        }

        async with websockets.connect(
            ws_url,
            additional_headers=extra_headers,
            max_size=2**22,
        ) as ws:
            self._ws = ws
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop(ws))
            logger.info("Connected to room room_id=%s", self.room_id)

            async for raw_message in ws:
                if not self._running:
                    break
                if not isinstance(raw_message, bytes):
                    continue
                await self._handle_raw_message(ws, raw_message)

    async def _handle_raw_message(self, ws: ClientConnection, data: bytes) -> None:
        # requires decoder.py + proto/ (not yet ported)
        pass

    async def _heartbeat_loop(self, ws: ClientConnection) -> None:
        # requires decoder.build_heartbeat() (not yet ported) — using ping as fallback
        while self._running:
            try:
                await ws.ping()
                await asyncio.sleep(cfg.DOUYIN_HEARTBEAT_INTERVAL)
            except Exception:
                break


class DouyinLiveMonitor:
    def __init__(self) -> None:
        self._clients: dict[str, DouyinLiveClient] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._ttwid: str = ""
        self._running = False
        self._pool: asyncpg.Pool | None = None

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def room_count(self) -> int:
        return len(self._clients)

    async def start(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        self._ttwid = await gen_ttwid()
        self._running = True
        logger.info("Douyin live monitor started (ttwid obtained)")

    async def stop(self) -> None:
        self._running = False
        for room_id in list(self._tasks.keys()):
            await self._stop_room(room_id)
        logger.info("Douyin live monitor stopped")

    async def add_room(self, live_url: str, company_id: str) -> dict:
        if not self._running or not self._pool:
            raise RuntimeError("Monitor not started")
        if len(self._clients) >= cfg.DOUYIN_MAX_ROOMS:
            raise ValueError(f"Max {cfg.DOUYIN_MAX_ROOMS} rooms reached")

        match = _LIVE_URL_PATTERN.search(live_url)
        if not match:
            raise ValueError(f"Invalid Douyin live URL: {live_url}")
        web_room_id = match.group(1)

        room_id, streamer_name = await resolve_room_info(web_room_id, self._ttwid)

        if room_id in self._clients:
            raise ValueError(f"Room {room_id} already being monitored")

        now = datetime.now(UTC)
        row = await self._pool.fetchrow(
            "SELECT id FROM douyin_live_rooms WHERE room_id = $1", room_id
        )

        if row is None:
            row = await self._pool.fetchrow(
                """
                INSERT INTO douyin_live_rooms
                    (id, company_id, room_id, web_room_id, streamer_name,
                     live_url, status, last_connected_at, created_at, updated_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'MONITORING', $6, $6, $6)
                RETURNING id, room_id, web_room_id, streamer_name, live_url, status,
                          viewer_count, product_count, last_connected_at,
                          error_message, created_at, updated_at
                """,
                company_id,
                room_id,
                web_room_id,
                streamer_name,
                live_url,
                now,
            )
        else:
            await self._pool.execute(
                """
                UPDATE douyin_live_rooms
                SET status = 'MONITORING',
                    streamer_name = $1,
                    last_connected_at = $2,
                    error_message = NULL,
                    updated_at = $2
                WHERE room_id = $3
                """,
                streamer_name,
                now,
                room_id,
            )
            row = await self._pool.fetchrow(
                """
                SELECT id, room_id, web_room_id, streamer_name, live_url, status,
                       viewer_count, product_count, last_connected_at,
                       error_message, created_at, updated_at
                FROM douyin_live_rooms WHERE room_id = $1
                """,
                room_id,
            )

        client = DouyinLiveClient(
            room_id=room_id,
            web_room_id=web_room_id,
            ttwid=self._ttwid,
            on_message=self._on_message,
        )
        self._clients[room_id] = client
        self._tasks[room_id] = asyncio.create_task(self._run_client(room_id, client))

        logger.info("Added room room_id=%s streamer=%s", room_id, streamer_name)
        return dict(row) if row else {}

    async def remove_room(self, room_id: str) -> None:
        await self._stop_room(room_id)
        if self._pool:
            await self._pool.execute(
                "UPDATE douyin_live_rooms SET status = 'PAUSED' WHERE room_id = $1",
                room_id,
            )
        logger.info("Removed room room_id=%s", room_id)

    async def get_status(self) -> dict[str, Any]:
        if not self._pool:
            return {"is_running": False, "total_rooms": 0, "monitoring_rooms": 0, "rooms": []}

        rows = await self._pool.fetch(
            """
            SELECT id, room_id, web_room_id, streamer_name, live_url, status,
                   viewer_count, product_count, last_connected_at,
                   error_message, created_at, updated_at
            FROM douyin_live_rooms
            """
        )
        monitoring = [r for r in rows if r["status"] == "MONITORING"]
        return {
            "is_running": self._running,
            "total_rooms": len(rows),
            "monitoring_rooms": len(monitoring),
            "active_connections": len(self._clients),
            "rooms": [dict(r) for r in rows],
        }

    async def _run_client(self, room_id: str, client: DouyinLiveClient) -> None:
        try:
            await client.start()
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.error("Client crashed room_id=%s", room_id, exc_info=True)
            if self._pool:
                await self._pool.execute(
                    """
                    UPDATE douyin_live_rooms
                    SET status = 'ERROR', error_message = 'Client crashed'
                    WHERE room_id = $1
                    """,
                    room_id,
                )
        finally:
            self._clients.pop(room_id, None)
            self._tasks.pop(room_id, None)

    async def _stop_room(self, room_id: str) -> None:
        client = self._clients.pop(room_id, None)
        if client:
            await client.stop()

        task = self._tasks.pop(room_id, None)
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def _on_message(self, method: str, parsed: Any, room_id: str) -> None:
        if not self._pool:
            return

        if method == "WebcastRoomUserSeqMessage":
            total_user = int(getattr(parsed, "totalUser", 0))
            await self._pool.execute(
                "UPDATE douyin_live_rooms SET viewer_count = $1 WHERE room_id = $2",
                total_user,
                room_id,
            )
        elif method == "WebcastControlMessage" and getattr(parsed, "status", 0) == 3:
            logger.info("Room stream ended room_id=%s", room_id)
            await self._pool.execute(
                "UPDATE douyin_live_rooms SET status = 'OFFLINE' WHERE room_id = $1",
                room_id,
            )
        elif method == "WebcastProductChange":
            await self._handle_product_change(room_id, parsed)

    async def _handle_product_change(self, room_id: str, msg: Any) -> None:
        if not self._pool:
            return

        db_room = await self._pool.fetchrow(
            "SELECT id FROM douyin_live_rooms WHERE room_id = $1", room_id
        )
        if not db_room:
            return

        live_room_id = db_room["id"]
        total = int(getattr(msg, "total", 0))
        await self._pool.execute(
            "UPDATE douyin_live_rooms SET product_count = $1 WHERE id = $2",
            total,
            live_room_id,
        )

        for product_info in getattr(msg, "updateProductInfoList", []):
            promotion_id = int(product_info.promotionId)
            existing = await self._pool.fetchval(
                """
                SELECT COUNT(*) FROM douyin_live_products
                WHERE live_room_id = $1 AND promotion_id = $2
                """,
                live_room_id,
                promotion_id,
            )
            if existing > 0:
                continue

            await self._pool.execute(
                """
                INSERT INTO douyin_live_products
                    (id, live_room_id, promotion_id, index_in_list,
                     match_status, detected_at)
                VALUES (gen_random_uuid(), $1, $2, $3, 'PENDING', $4)
                """,
                live_room_id,
                promotion_id,
                int(product_info.index),
                datetime.now(UTC),
            )
            logger.info("New product in room room_id=%s promotion_id=%d", room_id, promotion_id)
