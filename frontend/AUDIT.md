GraniteMeasure AI — Frontend↔Backend Integration Audit

This audit documents every frontend API call, the exact backend route(s) implemented in the repository, HTTP method, request body/form, headers, expected response shapes (from backend schemas), which frontend page uses each call, and notes about mismatches or important configuration.

SUMMARY
- Frontend base URL: NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 (frontend/.env.local)
- Backend entrypoint: backend/app/main.py (registers routers, configures CORS, adds /health)
- Backend settings: backend/app/core/config.py (cors_origins, database_url defaults to SQLite for local dev, database_init_mode)
- Frontend central API client: frontend/lib/api.ts (normalizes base URL and logs request errors)

FRONTEND → API CALLS (detailed)

1) listDemoUsers()
- Frontend: frontend/lib/api.ts -> call('/demo-users')
- Used by: frontend/app/page.tsx (Welcome / user selection)
- Method: GET
- URL: {NEXT_PUBLIC_API_URL}/demo-users
- Headers: X-Selected-User-Id if a selected user is stored in localStorage
- Request body: none
- Backend route: backend/app/api/v1/users.py
  - router prefix: prefix="/demo-users"
  - GET /demo-users → response model: list[DemoUserOut]
- DemoUserOut fields: id, name, role, is_active, avatar_initials

2) getQuarries()
- Frontend: call('/quarries')
- Used by: frontend/app/quarries/page.tsx, frontend/app/capture/page.tsx
- Method: GET
- URL: {NEXT_PUBLIC_API_URL}/quarries
- Backend route: backend/app/api/v1/quarries.py
  - GET /quarries → response model: list[QuarryOut]
- QuarryOut fields: id, quarry_name, quarry_code, lease_id, district, mandal, village, granite_category_id, latitude?, longitude?, boundary_geojson?, status

3) listCategories()
- Frontend: call('/granite-categories')
- Used by: frontend/app/capture/page.tsx
- Method: GET
- URL: {NEXT_PUBLIC_API_URL}/granite-categories
- Backend route: backend/app/api/v1/quarries.py
  - GET /granite-categories → returns array of { id, code, name, description }

4) listBlocks()
- Frontend: call('/granite-blocks')
- Used by: frontend/app/dashboard/page.tsx, frontend/app/blocks/page.tsx
- Method: GET
- URL: {NEXT_PUBLIC_API_URL}/granite-blocks
- Backend route: backend/app/api/v1/blocks.py
  - GET /granite-blocks → response model: list[BlockOut]
- BlockOut fields: id, block_code, quarry_id, granite_category_id, capture_date, operator_id, notes?, status, latitude?, longitude?, gps_accuracy_m?, gps_captured_at?

5) getBlock(id)
- Frontend: call(`/granite-blocks/${id}`)
- Used by: frontend/app/blocks/[id]/page.tsx
- Method: GET
- URL: {NEXT_PUBLIC_API_URL}/granite-blocks/{block_id}
- Backend: GET /granite-blocks/{block_id} → BlockOut

6) createBlock(payload)
- Frontend: POST to /granite-blocks
- Used by: frontend/app/capture/page.tsx (minimal block creation in capture flow)
- Method: POST
- URL: {NEXT_PUBLIC_API_URL}/granite-blocks
- Headers: Content-Type: application/json, X-Selected-User-Id if selected
- Request body (BlockCreate): { block_code?, quarry_id, granite_category_id, capture_date (ISO), notes?, gps?, skip_gps? }
- Backend: POST /granite-blocks → returns BlockOut
- Notes: backend will generate block_code if payload.block_code missing

7) createCaptureSession(payload)
- Frontend: POST to /capture-sessions
- Used by: frontend/app/capture/page.tsx (after block creation)
- Method: POST
- URL: {NEXT_PUBLIC_API_URL}/capture-sessions
- Headers: Content-Type: application/json, X-Selected-User-Id required by backend (require_selected_user)
- Request body (SessionCreate): { block_id, calibration_type, known_reference_cm?, marker_size_cm?, reference_pixels? }
- Backend: POST /capture-sessions → SessionOut (id, block_id, operator_id, status, calibration fields)
- Notes: require_selected_user dependency means X-Selected-User-Id header must be provided or the endpoint returns 400

8) uploadSessionImage(sessionId, file, capture_side)
- Frontend: multipart POST to /capture-sessions/{session_id}/images
- Used by: frontend/app/capture/page.tsx
- Method: POST
- URL: {NEXT_PUBLIC_API_URL}/capture-sessions/{session_id}/images
- Form fields: capture_side (string), file (UploadFile)
- Headers: Browser sets multipart Content-Type boundary; X-Selected-User-Id provided if selected
- Backend: POST /capture-sessions/{session_id}/images → returns { id, capture_side, storage_path }
- Notes: backend validates mime types and max size per settings.allowed_mimes / max_image_bytes

ADDITIONAL BACKEND ROUTES (available)
- POST /images/{image_id}/validate (validate an uploaded image)
- GET /capture-sessions/{session_id}/images (list images for a session)
- POST /capture-sessions/{session_id}/complete (complete a capture session)

BACKEND CONFIG & MAIN APP
- backend/app/core/config.py
  - Settings loaded via pydantic-settings (env_file=(".env","../.env"))
  - Defaults set for local dev: database_url defaults to sqlite:///./granitemeasure.db
  - cors_origins includes localhost:3000/3001 and 127.0.0.1:3000/3001
  - database_init_mode config option exists (default "none") — set to "create" to generate tables at startup

- backend/app/main.py
  - Creates FastAPI app
  - Configures CORSMiddleware using settings.cors_origin_list
  - Registers routers from app.api.v1: demo-users, quarries, granite-blocks, capture
  - Adds GET /health
  - On startup, if settings.database_init_mode == "create", calls Base.metadata.create_all(bind=engine)

CORS & FAILED FETCH ROOT CAUSE
- The common "TypeError: Failed to fetch" was caused by missing/insufficient CORS configuration when Next dev server used port 3001. Fixes applied:
  - cors_origins updated to include both 3000 and 3001 and 127.0.0.1 variants
  - CORSMiddleware added and configured with allow_methods=["*"], allow_headers=["*"], allow_credentials=True

DATABASE
- Local dev now defaults to SQLite (sqlite:///./granitemeasure.db) so the backend can run locally without Postgres/Docker
- To auto-create tables set backend/.env: DATABASE_INIT_MODE=create

FRONTEND API CLIENT CHANGES
- frontend/lib/api.ts now:
  - Normalizes NEXT_PUBLIC_API_URL (removes trailing slash)
  - Builds fullUrl robustly: `${API_URL}${path.startsWith("/") ? path : "/" + path}`
  - Logs console.error on failed requests with URL, status, and response body if available

FILES CHANGED OR ADDED (concise)
- backend/app/core/config.py (updated defaults)
- backend/app/main.py (created)
- frontend/.env.local (created)
- frontend/lib/api.ts (updated)
- frontend/lib/types.ts (created)
- frontend/lib/storage.ts (created)
- frontend/components/... (AppShell, AppHeader, BottomNavigation, UI components)
- frontend/components/capture/CameraCapture.tsx (camera + upload fallback)
- frontend/app/... routes (welcome, dashboard, capture, blocks, block detail, quarries, profile)

REMAINING WORK & RECOMMENDATIONS
- Implement quarry & granite-category selector UI on Capture page (currently auto-picks first entries).
- Implement multi-side capture flow (manage multiple sides locally before completing session).
- Implement Cut Optimization / Cut Recommendation result screen (requires backend analysis contract or fields in job results).
- Add an explicit health-check + Retry UI on Welcome page for better developer UX (I can add this quickly).

EXACT COMMANDS TO RUN LOCALLY
1) Backend
- cd backend
- python -m venv .venv
- .\.venv\Scripts\Activate.ps1   (PowerShell) or .venv\Scripts\activate (cmd)
- python -m pip install -r requirements.txt
- (optional) create backend/.env with:
    DATABASE_URL=sqlite:///./granitemeasure.db
    DATABASE_INIT_MODE=create
- Start server:
    python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
- Verify:
    curl http://127.0.0.1:8000/health
    Visit http://127.0.0.1:8000/docs

2) Frontend
- cd frontend
- npm ci
- npm run dev
- Open the Next URL (3000 or 3001) and test flows.

REQUESTS LOGGING & DEBUGGING
- Frontend logs failing requests with URL, status and response body (frontend/lib/api.ts)
- Use browser DevTools Network tab to inspect CORS headers when failures occur

NEXT ACTION OPTIONS
- I can create a repo audit file (this file was created: frontend/AUDIT.md)
- If you want, I can implement one of the remaining tasks (quarry picker, multi-side flow, health/retry UI, or enable DB create by creating backend/.env) — tell me which one to do next.

If you'd like a more machine-readable mapping (CSV or JSON) or a PR-ready change list, tell me which and I will create it.
