import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.init_db import init_db
from app.services.scheduler_service import booking_window_scheduler


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    stop_event = asyncio.Event()
    scheduler_task = asyncio.create_task(booking_window_scheduler(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        scheduler_task.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler_task


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/healthz")
def healthz():
    return {"status": "ok", "env": settings.app_env}
