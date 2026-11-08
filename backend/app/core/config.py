from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://visitly:visitly@localhost:5432/visitly"
    test_database_url: str = "postgresql+psycopg://visitly:visitly@localhost:5432/visitly_test"
    jwt_secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_expire_minutes: int = 480
    ai_provider: str = "anthropic"
    ai_api_key: str = ""
    ai_model: str = ""
    frontend_url: str = "http://localhost:5173"
    environment: str = "development"
    sentry_dsn: str = ""

    @model_validator(mode="after")
    def _normalise_and_guard(self):
        # Managed hosts hand out postgres:// or postgresql:// URLs; SQLAlchemy needs the psycopg driver prefix.
        for f in ("database_url", "test_database_url"):
            v = getattr(self, f)
            for old in ("postgres://", "postgresql://"):
                if v.startswith(old):
                    setattr(self, f, "postgresql+psycopg://" + v[len(old):])
        if self.environment == "production" and (self.jwt_secret_key.startswith("dev-only") or len(self.jwt_secret_key) < 32):
            raise ValueError("JWT_SECRET_KEY must be set to a random value of 32+ characters in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
