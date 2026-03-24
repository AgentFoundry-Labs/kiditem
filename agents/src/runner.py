import asyncio
import json
import signal
import traceback
from datetime import datetime, timezone

from src.config import POLL_INTERVAL_SECONDS
from src.db import get_pool, close_pool
from src.agents.base import BaseAgent
from src.agents.inventory import InventoryAgent

AGENTS: dict[str, BaseAgent] = {
    "inventory": InventoryAgent(),
}

running = True


def handle_shutdown(_sig, _frame):
    global running
    running = False
    print("\nShutting down...")


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


async def process_task(pool, task):
    task_id = str(task["id"])
    agent_type = task["agent_type"]
    task_input = json.loads(task["input"]) if task["input"] else None

    agent = AGENTS.get(agent_type)
    if not agent:
        await fail_task(pool, task_id, f"Unknown agent type: {agent_type}")
        return

    print(f"[{agent_type}] Running task {task_id[:8]}...")

    try:
        output = await agent.execute(pool, task_input)
        await agent.log(pool, task_id, "info", f"Task completed: {json.dumps(output)}")
        await complete_task(pool, task_id, output)
        print(f"[{agent_type}] ✓ Done: {json.dumps(output, ensure_ascii=False)}")
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        await agent.log(pool, task_id, "error", error_msg)
        await fail_task(pool, task_id, str(e))
        print(f"[{agent_type}] ✗ Failed: {e}")


async def main():
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    pool = await get_pool()
    print(f"Agent runner started. Polling every {POLL_INTERVAL_SECONDS}s...")

    while running:
        task = await claim_task(pool)
        if task:
            await process_task(pool, task)
        else:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    await close_pool()
    print("Agent runner stopped.")


if __name__ == "__main__":
    asyncio.run(main())
