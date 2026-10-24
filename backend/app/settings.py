import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass
class Settings:
    backboard_api_key: str = ""
    apify_token: str = ""
    gptzero_api_key: str = ""
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    extension_id: str = ""
    provider_timeout: float = 45
    cache_ttl: int = 900

    @classmethod
    def from_env(cls):
        load_dotenv()
        return cls(
            backboard_api_key=os.getenv("BACKBOARD_API_KEY", ""),
            apify_token=os.getenv("APIFY_TOKEN", ""),
            gptzero_api_key=os.getenv("GPTZERO_API_KEY", ""),
            cors_origins=os.getenv("CORS_ORIGINS", cls.cors_origins),
            extension_id=os.getenv("EXTENSION_ID", ""),
            provider_timeout=max(1, min(50, float(os.getenv("PROVIDER_TIMEOUT", "45")))),
            cache_ttl=max(1, min(3600, int(os.getenv("CACHE_TTL", "900")))),
        )
