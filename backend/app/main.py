from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import asyncio
from contextlib import asynccontextmanager

from app.api import auth, chat, crm, inbox, insights, leads, projects, public
from app.core.config import get_settings

@asynccontextmanager
async def lifespan(_):
    import os
    task = asyncio.create_task(insights.reminder_loop()) if os.environ.get("DISABLE_WORKER") != "1" else None
    yield
    if task:
        task.cancel()


def _init_monitoring():
    """Optional error monitoring: active only when SENTRY_DSN is set and sentry-sdk is installed."""
    dsn = get_settings().sentry_dsn
    if not dsn:
        return
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=dsn, environment=get_settings().environment, send_default_pii=False, traces_sample_rate=0.0)
    except ImportError:
        import logging
        logging.getLogger("visitly").warning("SENTRY_DSN set but sentry-sdk is not installed")


_init_monitoring()
app = FastAPI(title="Visitly API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[get_settings().frontend_url], allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])
for r in (auth.router, public.router, chat.router, leads.router, projects.router, insights.router, crm.router, inbox.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"status": "ok"}
