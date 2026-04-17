import asyncio
import logging
from datetime import datetime, timedelta

from app.db.seed_data import maintain_booking_window


logger = logging.getLogger(__name__)


def _seconds_until_next_midnight_plus_minute(now: datetime) -> float:
    next_run = (now + timedelta(days=1)).replace(hour=0, minute=1, second=0, microsecond=0)
    return max((next_run - now).total_seconds(), 1.0)


async def booking_window_scheduler(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        wait_seconds = _seconds_until_next_midnight_plus_minute(datetime.now())
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=wait_seconds)
            break
        except asyncio.TimeoutError:
            pass

        if stop_event.is_set():
            break

        try:
            maintain_booking_window()
            logger.info("daily booking window maintenance completed")
        except Exception:
            logger.exception("daily booking window maintenance failed")
