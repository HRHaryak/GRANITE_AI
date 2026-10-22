# Deploying GraniteMeasure AI Backend to Railway

This repository is pre-configured and ready to deploy the FastAPI backend to [Railway](https://railway.com/).

---

## 🚀 Quick Deployment Options

You have two simple options to deploy on Railway:

### Option A: Standard Deployment (Recommended)
Deploy directly from your GitHub repository root. Railway will automatically pick up `railway.json` and build the backend using `Dockerfile`.

1. Go to [Railway Dashboard](https://railway.com/dashboard).
2. Click **+ New Project** -> **Deploy from GitHub repo**.
3. Select this repository (`GRANITE_AI`).
4. Railway will automatically detect `railway.json`, build the backend image, and deploy it.

---

### Option B: Deploy with Backend as Root Directory
If you prefer organizing services with explicit subdirectories:

1. In Railway project dashboard, select your service.
2. Go to **Settings** -> **Source**.
3. Set **Root Directory** to `/backend`.
4. Railway will use `backend/railway.json` and `backend/Dockerfile`.

---

## 🗄️ Setting Up Database and Redis (Optional but Recommended)

GraniteMeasure AI works with SQLite by default, but for production on Railway, connecting managed **PostgreSQL** and **Redis** is recommended:

### 1. Add PostgreSQL
1. In your Railway project canvas, click **+ Create** / **+ New** -> **Database** -> **Add PostgreSQL**.
2. Railway will automatically create a PostgreSQL instance.
3. In your backend service **Variables** tab, click **+ Reference** -> select `DATABASE_URL` from the Postgres service (or Railway links it automatically as `${{Postgres.DATABASE_URL}}`).
4. *GraniteMeasure automatically normalizes connection strings* (`postgresql://`, `postgres://`, and `postgresql+psycopg://` are all handled automatically with no manual edits).

### 2. Add Redis
1. In the project canvas, click **+ Create** / **+ New** -> **Database** -> **Add Redis**.
2. In your backend service **Variables**, reference `REDIS_URL` as `${{Redis.REDIS_URL}}`.

---

## ⚙️ Environment Variables Reference

Configure these in your backend service under the **Variables** tab in Railway:

| Variable | Recommended Value | Description |
|---|---|---|
| `DATABASE_URL` | Auto from Railway Postgres | PostgreSQL connection string (falls back to local SQLite if unset) |
| `DATABASE_INIT_MODE` | `create` | Automatically creates missing tables on startup |
| `REDIS_URL` | Auto from Railway Redis | Redis connection string for background analysis jobs |
| `CORS_ORIGINS` | `*` (or your frontend domain) | Allowed CORS origins (comma-separated, or `*` to allow all) |
| `DEMO_MODE` | `false` | Enable/disable demo mock simulation |
| `SEED_DEMO_USERS` | `true` | Pre-seeds default admin user, demo quarry, and categories on first boot |
| `STORAGE_BACKEND` | `local` | `local` or `supabase` |
| `PORT` | Auto-assigned by Railway | Automatically bound to Railway's assigned port |

---

## 🏥 Healthcheck & Verification

- Railway automatically monitors your deployment using `GET /health`.
- Once deployed, click your generated Railway public domain (e.g. `https://xxx.up.railway.app`):
  - **`GET /`**: Returns API status summary:
    ```json
    {
      "name": "GraniteMeasure AI API",
      "status": "online",
      "docs": "/docs",
      "health": "/health"
    }
    ```
  - **`GET /health`**: Returns `{"status": "ok"}`
  - **`GET /docs`**: Interactive Swagger / OpenAPI documentation.

---

## 🔗 Connecting Frontend or Mobile App to the Deployed Backend

Update your frontend or mobile app configuration with your deployed Railway domain:

### Frontend (`frontend/.env.local` or Vercel / Railway frontend environment):
```bash
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
```

### Mobile App (`mobile/.env`):
```bash
EXPO_PUBLIC_API_URL=https://your-backend.up.railway.app
```
