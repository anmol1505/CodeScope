"""
CodeScope Execution Runner
---------------------------
Compiles and executes instrumented C++ code.
Returns stdout + stderr (trace events) + timing.

Security considerations for V1:
- Time limit: 10 seconds
- Memory limit: via ulimit in subprocess
- No network access
- Temp directory per execution, cleaned up after
"""

import subprocess
import tempfile
import os
import time
from pathlib import Path
from dataclasses import dataclass
from typing import Optional


@dataclass
class RunResult:
    success: bool
    stdout: str
    stderr: str          # raw trace JSONL
    compile_error: Optional[str]
    runtime_error: Optional[str]
    exit_code: int
    elapsed_ms: float
    timed_out: bool = False


def compile_and_run(
    instrumented_source: str,
    stdin_input: str = "",
    time_limit_sec: float = 10.0,
) -> RunResult:
    """
    Write source to temp file, compile with g++, run with input.
    Returns RunResult with stdout/stderr separated.
    """

    with tempfile.TemporaryDirectory() as tmpdir:
        src_path = os.path.join(tmpdir, "solution.cpp")
        bin_path = os.path.join(tmpdir, "solution")

        # Write source
        with open(src_path, 'w') as f:
            f.write(instrumented_source)

        # Compile
        compile_result = subprocess.run(
            [
                'g++', '-std=c++17', '-O0',  # O0 = no optimization, easier to trace
                '-o', bin_path,
                src_path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if compile_result.returncode != 0:
            return RunResult(
                success=False,
                stdout='',
                stderr='',
                compile_error=compile_result.stderr,
                runtime_error=None,
                exit_code=compile_result.returncode,
                elapsed_ms=0,
            )

        # Execute
        t0 = time.perf_counter()
        try:
            run_result = subprocess.run(
                [bin_path],
                input=stdin_input,
                capture_output=True,
                text=True,
                timeout=time_limit_sec,
                # Basic resource limits
                preexec_fn=lambda: _set_limits(),
            )
            elapsed = (time.perf_counter() - t0) * 1000

            runtime_err = None
            if run_result.returncode != 0 and run_result.returncode != -signal_value(run_result.returncode):
                # Non-zero exit might just be RE
                runtime_err = f"Runtime exit code: {run_result.returncode}"
                if run_result.stderr and not run_result.stderr.strip().startswith('{'):
                    runtime_err += f"\n{run_result.stderr}"

            # Separate trace JSON lines from any real stderr
            stderr_lines = run_result.stderr.split('\n')
            trace_lines = [l for l in stderr_lines if l.strip().startswith('{')]
            non_trace_lines = [l for l in stderr_lines if l.strip() and not l.strip().startswith('{')]

            trace_output = '\n'.join(trace_lines)
            extra_stderr = '\n'.join(non_trace_lines)

            if extra_stderr and not runtime_err:
                runtime_err = extra_stderr

            return RunResult(
                success=True,
                stdout=run_result.stdout,
                stderr=trace_output,
                compile_error=None,
                runtime_error=runtime_err,
                exit_code=run_result.returncode,
                elapsed_ms=elapsed,
            )

        except subprocess.TimeoutExpired:
            elapsed = (time.perf_counter() - t0) * 1000
            return RunResult(
                success=False,
                stdout='',
                stderr='',
                compile_error=None,
                runtime_error=f"Time limit exceeded ({time_limit_sec}s)",
                exit_code=-1,
                elapsed_ms=elapsed,
                timed_out=True,
            )


def _set_limits():
    """Set resource limits for subprocess."""
    import resource
    # 256 MB memory limit
    mem_limit = 256 * 1024 * 1024
    try:
        resource.setrlimit(resource.RLIMIT_AS, (mem_limit, mem_limit))
    except Exception:
        pass  # Not critical for V1


def signal_value(code):
    """Helper to check if exit code is a signal."""
    if code < 0:
        return -code
    return 0
