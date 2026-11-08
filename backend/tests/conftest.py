import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings

TEST_URL = os.environ.get("TEST_DATABASE_URL", get_settings().test_database_url)
os.environ["DATABASE_URL"] = TEST_URL  # app modules must never touch the dev DB during tests
get_settings.cache_clear()

from app.database import Base  # noqa: E402
import app.models  # noqa: E402,F401

test_engine = create_engine(TEST_URL, pool_size=20, max_overflow=20)
TestSession = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.drop_all(test_engine)
    Base.metadata.create_all(test_engine)
    yield


@pytest.fixture(autouse=True)
def _reset_ratelimit():
    from app.core import ratelimit
    ratelimit.reset()
    yield


@pytest.fixture()
def db():
    s = TestSession()
    try:
        yield s
    finally:
        s.rollback()
        s.close()
        with test_engine.begin() as c:
            for t in reversed(Base.metadata.sorted_tables):
                c.execute(t.delete())
