from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"chrome-extension://[a-z]{32}",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix=settings.api_prefix)


@app.get("/")
def get_routes():
    """
    Returns a list of all available routes and their methods.
    """
    route_list = []
    for route in app.routes:
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", None)
        if methods and path:
            route_list.append({"path": path, "methods": list(methods)})
    return {"app_name": app.title, "routes": route_list}


@app.on_event("startup")
def on_startup() -> None:
    # Diagnostic: Print all registered routes
    print("\n" + "="*50)
    print("REST API Routes:")
    for route in app.routes:
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", None)
        if methods and path:
            print(f"  {list(methods)} {path}")
    print("="*50 + "\n")

    # Diagnostic: Print used database URL (masked)
    db_url = settings.database_url
    print(f"Connecting to database: {db_url}")
    
    try:
        Base.metadata.create_all(bind=engine)
        print("Database tables created/verified successfully.")
    except Exception as e:
        print(f"DATABASE ERROR during startup: {e}")
        # Not re-raising here to allow the process to stay alive if needed for debugging,
        # though usually Base.metadata.create_all failing is critical.
        raise e
