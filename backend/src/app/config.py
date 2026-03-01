import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://learn:learn@localhost:5432/learn"
    default_model: str = "anthropic:claude-sonnet-4-6"
    anthropic_api_key: str = ""
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

if not settings.anthropic_api_key:
    import sys
    print(
        "\n"
        "  ⚠️  ANTHROPIC_API_KEY is not set.\n"
        "  The app will start, but course generation will fail.\n"
        "\n"
        "  Set it in backend/.env or as an environment variable.\n"
        "  Get a key at https://console.anthropic.com\n",
        file=sys.stderr,
    )
else:
    # Expose API key to environment so PydanticAI's provider picks it up
    os.environ.setdefault("ANTHROPIC_API_KEY", settings.anthropic_api_key)
