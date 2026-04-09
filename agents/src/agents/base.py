from abc import ABC, abstractmethod

import asyncpg


class BaseAgent(ABC):
    agent_type: str
    timeout_seconds: int = 300  # 5분 기본값. agent별로 override 가능.

    @abstractmethod
    async def execute(self, pool: asyncpg.Pool, task_input: dict | None) -> dict: ...
