"""
FastAPI server for Python agents (content, image_edit).
Replaces runner.py DB polling with HTTP interface.
Called by NestJS python_http adapter.
"""
import asyncio

import structlog
from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager

from src.db import get_pool, close_pool
from src.agents.content.agent import ContentAgent
from src.agents.image_edit import ImageEditAgent
from src.agents.sourcing import SourcingAgent

logger = structlog.get_logger()

AGENTS = {
    "content": ContentAgent(),
    "image_edit": ImageEditAgent(),
    "sourcing": SourcingAgent(),
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await get_pool()
    logger.info("server_started", agents=list(AGENTS.keys()))
    yield
    await close_pool()
    logger.info("server_stopped")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
async def health():
    return {"ok": True, "agents": list(AGENTS.keys())}


@app.post("/run")
async def run(body: dict):
    agent_type = body.get("agent_type")
    if not agent_type or agent_type not in AGENTS:
        raise HTTPException(400, f"Unknown agent_type: {agent_type}")

    agent = AGENTS[agent_type]
    task_input = body.get("input", {})

    pool = await get_pool()

    try:
        result = await asyncio.wait_for(
            agent.execute(pool, task_input),
            timeout=agent.timeout_seconds,
        )
        return {"output": result}
    except asyncio.TimeoutError:
        raise HTTPException(504, f"Agent {agent_type} timed out after {agent.timeout_seconds}s")
    except Exception as e:
        logger.error("agent_error", agent_type=agent_type, error=str(e))
        raise HTTPException(500, str(e))
