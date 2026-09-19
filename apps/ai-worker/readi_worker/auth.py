"""Service authentication for API → worker calls (ADR-0004). The worker is never public."""

import hmac
from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import SecretStr

_bearer = HTTPBearer(auto_error=False)


def require_service_token(
    token: SecretStr,
) -> Callable[..., Coroutine[Any, Any, None]]:
    """A dependency rejecting requests without the shared service token (constant-time compare)."""
    expected = token.get_secret_value().encode()

    async def dependency(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    ) -> None:
        supplied = credentials.credentials.encode() if credentials else b""
        if not hmac.compare_digest(supplied, expected):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")

    return dependency
