"""Sliding-window login throttle (in-memory).

Per-process by design for this MVP: with several API instances each keeps its own counters, so the
effective limit is multiplied. Production should use a shared store (Redis) or the platform's WAF.
"""
import threading
import time
from collections import defaultdict, deque

WINDOW_SECONDS = 15 * 60
MAX_FAILS_PER_ACCOUNT = 5
MAX_FAILS_PER_IP = 20

_lock = threading.Lock()
_fails: dict[str, deque] = defaultdict(deque)


def _prune(q: deque, now: float) -> None:
    while q and now - q[0] > WINDOW_SECONDS:
        q.popleft()


def retry_after(account: str, ip: str, now: float | None = None) -> int:
    """Seconds the caller must wait, or 0 if allowed."""
    now = now or time.time()
    wait = 0
    with _lock:
        for key, limit in ((f"a:{account}", MAX_FAILS_PER_ACCOUNT), (f"i:{ip}", MAX_FAILS_PER_IP)):
            q = _fails[key]
            _prune(q, now)
            if len(q) >= limit:
                wait = max(wait, int(WINDOW_SECONDS - (now - q[0])) + 1)
    return wait


def record_failure(account: str, ip: str, now: float | None = None) -> None:
    now = now or time.time()
    with _lock:
        _fails[f"a:{account}"].append(now)
        _fails[f"i:{ip}"].append(now)


def record_success(account: str) -> None:
    with _lock:
        _fails.pop(f"a:{account}", None)


def reset() -> None:
    with _lock:
        _fails.clear()
