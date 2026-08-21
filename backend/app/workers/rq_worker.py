from redis import Redis
from rq import Queue, Worker

from app.core.config import get_settings


def get_queue() -> Queue:
    redis = Redis.from_url(get_settings().redis_url)
    return Queue("analysis", connection=redis)


def enqueue_analysis(job_id: str) -> str:
    q = get_queue()
    rq_job = q.enqueue("app.workers.analysis.run_analysis_job", job_id, job_timeout=60 * 30)
    return rq_job.id


if __name__ == "__main__":
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url)
    worker = Worker(["analysis"], connection=redis)
    worker.work()
