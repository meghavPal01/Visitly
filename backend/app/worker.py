"""Standalone reminder worker: `python -m app.worker`.

Run this as its own process (and start the API with DISABLE_WORKER=1) so reminders keep flowing when API instances
restart or scale. Safe to run more than one copy: due reminders are claimed with FOR UPDATE SKIP LOCKED and
flipped to sent in the same transaction, so each is sent once.
"""
import logging
import signal
import time

from app.database import SessionLocal
from app.services.notification_service import process_due_reminders

log = logging.getLogger("visitly.worker")
_stop = False


def _handle(*_):
    global _stop
    _stop = True


def main(interval: int = 30) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    signal.signal(signal.SIGINT, _handle)
    signal.signal(signal.SIGTERM, _handle)
    log.info("reminder worker started (every %ss)", interval)
    while not _stop:
        try:
            with SessionLocal() as db:
                res = process_due_reminders(db)
            if any(res.values()):
                log.info("processed %s", res)
        except Exception:
            log.exception("worker iteration failed")
        for _ in range(interval):
            if _stop:
                break
            time.sleep(1)
    log.info("reminder worker stopped")


if __name__ == "__main__":
    main()
