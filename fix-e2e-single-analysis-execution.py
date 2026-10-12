from __future__ import annotations

import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(r"C:\Users\hrhar\Project\granitemeasure-ai")
BACKEND = ROOT / "backend"
TARGET = BACKEND / "tests" / "test_pipeline.py"

MARKER = "# E2E_SINGLE_EXECUTION_ANALYSIS_JOB_V1"

if not TARGET.exists():
    raise SystemExit(f"[ERROR] Missing: {TARGET}")

text = TARGET.read_text(encoding="utf-8")

old = '''    _e2e_progress("22 capture complete; create analysis job")
    r_job = client.post(
        "/api/v1/analysis-jobs",
        json={
            "capture_session_id": (
                session_id
            )
        },
    )
    assert r_job.status_code == 200
'''

new = '''    _e2e_progress("22 capture complete; create analysis job")

    # E2E_SINGLE_EXECUTION_ANALYSIS_JOB_V1
    #
    # The production API intentionally starts analysis automatically when no
    # active RQ worker is available. Starlette TestClient waits for response
    # background tasks, so allowing that behavior here would execute the
    # worker inside the TestClient/background-task thread before this POST
    # returns. This E2E test then explicitly calls run_analysis_job(job_id)
    # below, causing two executions of the same analysis job.
    #
    # For this test only:
    #   1. force the API down the background-task branch,
    #   2. replace only the API module's background worker reference with a
    #      no-op,
    #   3. obtain the persisted job id,
    #   4. execute the real worker exactly once below in the test thread.
    #
    # Production API behavior is not changed.
    import app.api.v1.analysis as analysis_api
    from unittest.mock import patch as mock_patch

    with (
        mock_patch.object(
            analysis_api,
            "has_active_rq_workers",
            return_value=False,
        ),
        mock_patch.object(
            analysis_api,
            "run_analysis_job",
            return_value=None,
        ),
    ):
        r_job = client.post(
            "/api/v1/analysis-jobs",
            json={
                "capture_session_id": (
                    session_id
                )
            },
        )

    assert r_job.status_code == 200, (
        "Analysis job creation failed: "
        f"status={r_job.status_code}, "
        f"body={r_job.text}"
    )
'''

if MARKER in text:
    print("[OK] Single-execution E2E patch already installed.")
elif old not in text:
    raise SystemExit(
        "[ERROR] Could not find the exact Step-22 analysis-job block. "
        "No file was changed."
    )
else:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = TARGET.with_name(
        f"{TARGET.name}.backup-single-analysis-{stamp}"
    )
    shutil.copy2(TARGET, backup)
    print(f"[BACKUP] {backup}")

    patched = text.replace(old, new, 1)

    try:
        compile(patched, str(TARGET), "exec")
    except SyntaxError as exc:
        raise SystemExit(
            f"[ERROR] Patched test would not compile: {exc}"
        )

    TARGET.write_text(patched, encoding="utf-8")
    print("[OK] Patched E2E analysis job to execute worker once.")
    print("[OK] Production API files were not modified.")

print("\nCompiling test_pipeline.py...")
result = subprocess.run(
    [sys.executable, "-m", "py_compile", str(TARGET)],
    cwd=BACKEND,
)
if result.returncode != 0:
    raise SystemExit("[ERROR] Python compile failed.")
print("[OK] Python compile")

print("\nRunning targeted E2E test...")
result = subprocess.run(
    [
        sys.executable,
        "-m",
        "pytest",
        "tests/test_pipeline.py::test_full_e2e_workflow",
        "-vv",
        "-s",
        "--tb=short",
    ],
    cwd=BACKEND,
)

print()
if result.returncode == 0:
    print("[OK] Targeted E2E test passed.")
    print("Next command:")
    print(r".\.venv\Scripts\python.exe -m pytest tests\ -q")
else:
    print(
        f"[FAILED] Targeted E2E exit code: {result.returncode}"
    )
    print(
        "The duplicate/background execution path is now isolated. "
        "Send the new output so the next real worker-stage failure can "
        "be fixed exactly."
    )
    raise SystemExit(result.returncode)
