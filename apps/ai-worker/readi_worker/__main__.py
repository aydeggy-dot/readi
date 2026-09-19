"""Entry point: `python -m readi_worker` (used by `pnpm dev:worker`)."""

import sys

import uvicorn

from readi_worker.settings import SettingsError, load_settings


def main() -> None:
    try:
        settings = load_settings()
    except SettingsError as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(1) from None
    uvicorn.run(
        "readi_worker.main:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
        reload=settings.environment == "development",
    )


if __name__ == "__main__":
    main()
