"""Track in-flight course generation tasks and broadcast SSE events to subscribers."""

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# {course_id: asyncio.Task}
_active_tasks: dict[str, asyncio.Task] = {}

# {course_id: list[asyncio.Queue]}
_subscribers: dict[str, list[asyncio.Queue]] = {}


def start_generation(course_id: str, coro) -> asyncio.Task:
    """Spawn a background task for course generation and track it."""
    if course_id in _active_tasks and not _active_tasks[course_id].done():
        raise RuntimeError(f"Generation already running for course {course_id}")

    task = asyncio.create_task(coro)
    _active_tasks[course_id] = task

    # Auto-cleanup when the task finishes
    task.add_done_callback(lambda _t: cleanup(course_id))
    return task


def subscribe(course_id: str) -> asyncio.Queue:
    """Create a new SSE subscriber queue for a course generation."""
    queue: asyncio.Queue = asyncio.Queue()
    _subscribers.setdefault(course_id, []).append(queue)
    return queue


def unsubscribe(course_id: str, queue: asyncio.Queue) -> None:
    """Remove a subscriber queue."""
    queues = _subscribers.get(course_id, [])
    if queue in queues:
        queues.remove(queue)
    if not queues:
        _subscribers.pop(course_id, None)


async def broadcast(course_id: str, event: str, data: dict[str, Any] | None = None) -> None:
    """Send an SSE event to all subscribers for a course."""
    message = {"event": event, "data": data or {}}
    for queue in _subscribers.get(course_id, []):
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            logger.warning("SSE queue full for course %s, dropping event %s", course_id, event)


def is_running(course_id: str) -> bool:
    """Check if generation is currently in-flight for a course."""
    task = _active_tasks.get(course_id)
    return task is not None and not task.done()


def cleanup(course_id: str) -> None:
    """Remove tracking state for a completed generation."""
    _active_tasks.pop(course_id, None)
    # Don't remove subscribers here -- they may still be draining events.
    # They'll be removed when they unsubscribe.
