from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, leads, projects, public
from app.core.config import get_settings

app = FastAPI(title="Visitly API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=[get_settings().frontend_url], allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])
for r in (auth.router, public.router, leads.router, projects.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"status": "ok"}
