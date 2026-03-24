from abc import ABC, abstractmethod
from datetime import datetime, timezone

import asyncpg


class BaseAgent(ABC):
    agent_type: str

    @abstractmethod
    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict: ...

    async def log(
        self, pool: asyncpg.Pool, task_id: str, level: str, message: str, data: dict | None = None
    ) -> None:
        await pool.execute(
            """
            INSERT INTO agent_logs (id, task_id, level, message, data, created_at)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
            """,
            task_id,
            level,
            message,
            data,
            datetime.now(timezone.utc),
        )
