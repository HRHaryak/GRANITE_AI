web: uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
worker: python -m app.workers.rq_worker
