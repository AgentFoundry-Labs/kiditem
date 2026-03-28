import asyncio
import json
import signal
import traceback
from datetime import datetime, timezone

import structlog
from langfuse import get_client

from src.config import POLL_INTERVAL_SECONDS

logger = structlog.get_logger()
_lf = get_client()
from src.db import get_pool, close_pool
from src.agents.base import BaseAgent
from src.agents.content.agent import ContentAgent
from src.agents.image_edit import ImageEditAgent
from src.agents.inventory import InventoryAgent
from src.agents.sourcing.agent import SourcingAgent

AGENTS: dict[str, BaseAgent] = {
    "inventory": InventoryAgent(),
    "sourcing": SourcingAgent(),
    "content": ContentAgent(),
    "image_edit": ImageEditAgent(),
}

running = True
task_event = asyncio.Event()


def handle_shutdown(_sig, _frame):
    global running
    running = False
    task_event.set()
    logger.info("shutting_down")


async def claim_task(pool):
    return await pool.fetchrow(
        """
        UPDATE agent_tasks
        SET status = 'running', started_at = $1
        WHERE id = (
            SELECT id FROM agent_tasks
            WHERE status = 'pending'
            ORDER BY priority DESC, created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, agent_type, input
        """,
        datetime.now(timezone.utc),
    )


async def complete_task(pool, task_id: str, output: dict):
    await pool.execute(
        """
        UPDATE agent_tasks
        SET status = 'completed', output = $1, completed_at = $2
        WHERE id = $3
        """,
        json.dumps(output),
        datetime.now(timezone.utc),
        task_id,
    )


async def fail_task(pool, task_id: str, error: str):
    await pool.execute(
        """
        UPDATE agent_tasks
        SET status = 'failed', error = $1, completed_at = $2
        WHERE id = $3
        """,
        error,
        datetime.now(timezone.utc),
        task_id,
    )


async def update_task_progress(pool, task_id: str, progress: dict):
    await pool.execute(
        "UPDATE agent_tasks SET output = $1 WHERE id = $2",
        json.dumps(progress, ensure_ascii=False),
        task_id,
    )


async def process_task(pool, task):
    task_id = str(task["id"])
    agent_type = task["agent_type"]
    task_input = json.loads(task["input"]) if task["input"] else None
    if task_input is None:
        task_input = {}
    task_input["_task_id"] = task_id

    agent = AGENTS.get(agent_type)
    if not agent:
        await fail_task(pool, task_id, f"Unknown agent type: {agent_type}")
        return

    task_input["_progress_callback"] = lambda progress: update_task_progress(
        pool, task_id, progress
    )

    logger.info("task_started", agent_type=agent_type, task_id=task_id[:8])

    try:
        async with asyncio.timeout(agent.timeout_seconds):
            output = await agent.execute(pool, task_input)
        await agent.log(pool, task_id, "info", f"Task completed: {json.dumps(output)}")
        await complete_task(pool, task_id, output)
        logger.info("task_completed", agent_type=agent_type, task_id=task_id[:8])
    except TimeoutError:
        error_msg = f"Agent timed out after {agent.timeout_seconds}s"
        await agent.log(pool, task_id, "error", error_msg)
        await fail_task(pool, task_id, error_msg)
        logger.error(
            "task_timeout",
            agent_type=agent_type,
            task_id=task_id[:8],
            timeout=agent.timeout_seconds,
        )
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        await agent.log(pool, task_id, "error", error_msg)
        await fail_task(pool, task_id, str(e))
        logger.error("task_failed", agent_type=agent_type, task_id=task_id[:8], error=str(e))
    finally:
        _lf.flush()


async def drain_pending(pool):
    while running:
        task = await claim_task(pool)
        if not task:
            break
        await process_task(pool, task)


def on_notify(conn, pid, channel, payload):
    task_event.set()


async def listen_loop(pool):
    conn = await pool.acquire()
    try:
        await conn.add_listener("new_agent_task", on_notify)
        logger.info("listen_started", channel="new_agent_task")

        while running:
            task_event.clear()
            await drain_pending(pool)

            try:
                await asyncio.wait_for(task_event.wait(), timeout=POLL_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                pass
    finally:
        await conn.remove_listener("new_agent_task", on_notify)
        await pool.release(conn)


async def main():
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    pool = await get_pool()
    logger.info("runner_started", poll_interval=POLL_INTERVAL_SECONDS)

    await drain_pending(pool)
    await listen_loop(pool)

    _lf.shutdown()
    await close_pool()
    logger.info("runner_stopped")


if __name__ == "__main__":
    asyncio.run(main())
