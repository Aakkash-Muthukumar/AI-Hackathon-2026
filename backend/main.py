import os
import logging
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from services import arize_service
from routers import assignments, discovery, google_auth, evaluate

_sentry_dsn = os.getenv("SENTRY_DSN", "").strip()
if _sentry_dsn and "..." not in _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        traces_sample_rate=1.0,
        environment=os.getenv("ENVIRONMENT", "development"),
    )

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    arize_service.initialize()
    logger.info("Scaffold backend ready")
    yield


app = FastAPI(
    title="Scaffold API",
    description="Assignment-completion tracking system",
    version="1.0.0",
    lifespan=lifespan,
)

origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assignments.router, prefix="/api")
app.include_router(discovery.router, prefix="/api")
app.include_router(evaluate.router, prefix="/api")
app.include_router(google_auth.router)   # /auth/google/* — no /api prefix (browser redirects)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "scaffold-api"}
