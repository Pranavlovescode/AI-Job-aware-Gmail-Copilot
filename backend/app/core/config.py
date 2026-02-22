from functools import lru_cache
from typing import List

from dotenv import load_dotenv
from pydantic import AliasChoices, Field

from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    app_name: str = "AI Job-Aware Gmail Copilot API"
    app_env: str = "dev"
    api_prefix: str = "/api/v1"

    cors_origins: str = "http://localhost:3000,chrome-extension://*"
    database_url: str = Field(
        default="sqlite:///./test.db",
        validation_alias=AliasChoices(
            "DATABASE_URL",
            "DB_URL",
            "database_url",
            "db_url",
        ),
    )

    openai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "OPENAI_API_KEY",
            "OPENAI_KEY",
            "openai_api_key",
            "openai_key",
        ),
    )
    openai_model: str = "gpt-4o-mini"
    vector_provider: str = "memory"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
