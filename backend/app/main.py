from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import asyncio
from contextlib import asynccontextmanager

from app.api import auth, chat, crm, insights, leads, projects, public
from app.core.config import get_settings

@asynccontextmanager
async def lifespan(_):
    import os
    task = asyncio.create_task(insights.reminder_loop()) if os.environ.get("DISABLE_WORKER") != "1" else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="Visitly API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[get_settings().frontend_url], allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])
for r in (auth.router, public.router, chat.router, leads.router, projects.router, insights.router, crm.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"status": "ok"}
