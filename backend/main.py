from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import traceback, os, re

from instrumentor import instrument_v2, detect_algorithm, TRACE_HEADER
from runner import compile_and_run
from trace_parser import parse_trace

app = FastAPI(title="CodeScope API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

HEADER_LINES = len(TRACE_HEADER.split('\n'))


class RunRequest(BaseModel):
    source: str
    stdin: Optional[str] = ""
    time_limit: Optional[float] = 10.0


class RunResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    compile_error: Optional[str] = None
    events: list = []
    var_histories: dict = {}
    key_moments: list = []
    summary: dict = {}
    algorithm_hint: dict = {}
    stdout: str = ""
    elapsed_ms: float = 0.0
    total_steps: int = 0


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/run", response_model=RunResponse)
async def run_code(req: RunRequest):
    if len(req.source) > 60_000:
        raise HTTPException(400, "Source too large (max 60KB)")
    try:
        algo_hint = detect_algorithm(req.source)
        instrumented, annotations = instrument_v2(req.source)
        run_result = compile_and_run(
            instrumented_source=instrumented,
            stdin_input=req.stdin or "",
            time_limit_sec=min(req.time_limit or 10.0, 15.0),
        )

        if run_result.compile_error:
            return RunResponse(
                success=False,
                compile_error=_clean_error(run_result.compile_error),
            )

        trace = parse_trace(
            stderr_output=run_result.stderr,
            stdout_output=run_result.stdout,
            algo_hint=algo_hint,
        )

        return RunResponse(
            success=True,
            events=trace.events,
            var_histories=trace.var_histories,
            key_moments=trace.key_moments,
            summary=trace.summary,
            algorithm_hint=algo_hint,
            stdout=run_result.stdout,
            elapsed_ms=run_result.elapsed_ms,
            total_steps=trace.total_steps,
            error=run_result.runtime_error,
        )

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, str(e))


def _clean_error(err: str) -> str:
    """Adjust line numbers to point to user's original code."""
    out = []
    for line in err.split('\n'):
        m = re.match(r'(.+\.cpp):(\d+):(.+)', line)
        if m:
            adj = max(1, int(m.group(2)) - HEADER_LINES)
            out.append(f"Line {adj}:{m.group(3)}")
        else:
            out.append(line)
    return '\n'.join(out)


# ── Serve compiled frontend ─────────────────────────────────────
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    assets_dir = os.path.join(static_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(static_dir, "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        idx = os.path.join(static_dir, "index.html")
        if os.path.exists(idx):
            return FileResponse(idx)
        raise HTTPException(404)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
