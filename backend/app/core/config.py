from functools import lru_cache

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
