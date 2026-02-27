import time
from dataclasses import dataclass
from typing import TypeVar

from pydantic import BaseModel
from pydantic_ai import Agent
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import AgentLog

T = TypeVar("T", bound=BaseModel)


@dataclass
class AgentContext:
    """Context passed to all agent calls for logging and scoping."""

    db: AsyncSession
    user_id: str
    course_instance_id: str


async def log_agent_call(
    ctx: AgentContext,
    agent_name: str,
    prompt: str,
    output: str | None,
    status: str,
    duration_ms: int,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    model_name: str | None = None,
) -> AgentLog:
    log = AgentLog(
        user_id=ctx.user_id,
        course_instance_id=ctx.course_instance_id,
        agent_name=agent_name,
        prompt=prompt,
        output=output,
        status=status,
        duration_ms=duration_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        model_name=model_name,
    )
    ctx.db.add(log)
    await ctx.db.flush()
    return log


class AgentTimer:
    """Simple context manager for timing agent calls."""

    def __enter__(self):
        self._start = time.monotonic()
        return self

    def __exit__(self, *args):
        pass

    @property
    def duration_ms(self) -> int:
        return int((time.monotonic() - self._start) * 1000)


async def run_agent(
    ctx: AgentContext,
    agent: Agent[None, T],
    agent_name: str,
    prompt: str,
) -> T:
    """Run a PydanticAI agent with timing and logging. Reduces per-agent boilerplate."""
    with AgentTimer() as timer:
        try:
            result = await agent.run(prompt, model=settings.default_model)
            output = result.output
            usage = result.usage()
            await log_agent_call(
                ctx,
                agent_name=agent_name,
                prompt=prompt,
                output=output.model_dump_json(),
                status="success",
                duration_ms=timer.duration_ms,
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens,
                model_name=settings.default_model,
            )
            return output
        except Exception as e:
            await log_agent_call(
                ctx,
                agent_name=agent_name,
                prompt=prompt,
                output=str(e),
                status="error",
                duration_ms=timer.duration_ms,
                model_name=settings.default_model,
            )
            raise
