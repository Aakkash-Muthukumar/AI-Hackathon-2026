import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from services import arize_service, rubric_vector_service, sentry_service
from routers import assignments, discovery, google_auth, evaluate, debug

sentry_service.init()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    arize_service.initialize()
    await rubric_vector_service.ensure_index()
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
app.include_router(debug.router, prefix="/api")
app.include_router(google_auth.router)   # /auth/google/* — no /api prefix (browser redirects)


@app.middleware("http")
async def sentry_user_context(request: Request, call_next):
    """Attach X-User-ID to Sentry events for cross-client debugging."""
    user_id = request.headers.get("X-User-ID")
    if user_id:
        sentry_service.set_user(user_id)
    sentry_service.add_breadcrumb(
        "http",
        f"{request.method} {request.url.path}",
        data={"has_user_id": bool(user_id)},
    )
    return await call_next(request)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "scaffold-api",
        "sentry": sentry_service.is_enabled(),
    }
