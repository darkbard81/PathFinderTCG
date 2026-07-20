#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any


AUTH_PATH = Path.home() / ".codex" / "auth.json"
API_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"
TIMEOUT_SECONDS = 30


def format_local_time(value: Any) -> str:
    """UTC ISO-8601 또는 Unix timestamp를 시스템 로컬 시간으로 변환한다."""
    if value in (None, ""):
        return "-"

    try:
        if isinstance(value, (int, float)):
            timestamp = float(value)

            # 밀리초 단위 Unix timestamp 대응
            if timestamp > 10_000_000_000:
                timestamp /= 1000

            parsed = datetime.fromtimestamp(timestamp).astimezone()

        elif isinstance(value, str):
            normalized = value.strip()

            if normalized.endswith("Z"):
                normalized = normalized[:-1] + "+00:00"

            parsed = datetime.fromisoformat(normalized)

            # 시간대 정보가 없다면 UTC로 간주
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=datetime.UTC)

            parsed = parsed.astimezone()

        else:
            return str(value)

        timezone_name = parsed.tzname() or "local"
        return parsed.strftime(f"%Y-%m-%d %H:%M:%S ({timezone_name})")

    except (TypeError, ValueError, OverflowError):
        return "시간 형식 해석 실패"


def load_credentials() -> tuple[str, str | None]:
    if not AUTH_PATH.is_file():
        raise RuntimeError(f"Codex 자격 증명 파일을 찾을 수 없습니다: {AUTH_PATH}")

    try:
        auth_data = json.loads(AUTH_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("auth.json이 올바른 JSON 형식이 아닙니다.") from exc
    except OSError as exc:
        raise RuntimeError("auth.json을 읽을 수 없습니다.") from exc

    tokens = auth_data.get("tokens")
    if not isinstance(tokens, dict):
        raise RuntimeError("auth.json에서 tokens 객체를 찾을 수 없습니다.")

    access_token = tokens.get("access_token")
    if not isinstance(access_token, str) or not access_token.strip():
        raise RuntimeError("auth.json에서 유효한 tokens.access_token을 찾을 수 없습니다.")

    # 계정 ID는 일부 ChatGPT 백엔드 요청에 필요할 수 있지만 출력하지 않는다.
    account_id = (
        tokens.get("account_id")
        or auth_data.get("account_id")
        or auth_data.get("chatgpt_account_id")
    )

    if not isinstance(account_id, str) or not account_id.strip():
        account_id = None

    return access_token, account_id


def request_reset_credits(
    access_token: str,
    account_id: str | None,
) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "OpenAI-Beta": "codex-1",
        "originator": "Codex Desktop",
        "User-Agent": "codex-reset-credit-checker/1.0",
    }

    if account_id:
        headers["ChatGPT-Account-ID"] = account_id

    request = urllib.request.Request(
        API_URL,
        headers=headers,
        method="GET",
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=TIMEOUT_SECONDS,
        ) as response:
            raw_data = response.read().decode("utf-8")

    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            raise RuntimeError(
                "HTTP 401: 자격 증명 만료 또는 올바른 "
                "Authorization 헤더 누락/오류"
            ) from None

        raise RuntimeError(f"HTTP 요청 실패: 상태 코드 {exc.code}") from None

    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", "알 수 없는 네트워크 오류")
        raise RuntimeError(f"네트워크 요청 실패: {reason}") from None

    except TimeoutError:
        raise RuntimeError("요청 시간이 초과되었습니다.") from None

    try:
        payload = json.loads(raw_data)
    except json.JSONDecodeError as exc:
        raise RuntimeError("서버 응답이 올바른 JSON 형식이 아닙니다.") from exc

    if not isinstance(payload, dict):
        raise RuntimeError("서버가 예상하지 못한 응답 형식을 반환했습니다.")

    return payload


def print_summary(payload: dict[str, Any]) -> None:
    available_count = payload.get("available_count")

    # 향후 응답이 camelCase 또는 중첩 구조로 변경되는 경우도 일부 대응
    container = payload.get("rateLimitResetCredits")
    if isinstance(container, dict):
        if available_count is None:
            available_count = container.get(
                "availableCount",
                container.get("available_count"),
            )
        credits = container.get("credits", [])
    else:
        credits = payload.get("credits", [])

    if available_count is None:
        available_count = payload.get("availableCount", 0)

    if not isinstance(credits, list):
        credits = []

    print(f"available_count: {available_count}")
    print()

    if not credits:
        print("credits: 없음")
        return

    for index, credit in enumerate(credits, start=1):
        if not isinstance(credit, dict):
            continue

        status = credit.get("status", "-")
        title = credit.get("title", "-")
        granted_at = credit.get("granted_at", credit.get("grantedAt"))
        expires_at = credit.get("expires_at", credit.get("expiresAt"))

        print(f"[credit {index}]")
        print(f"status: {status}")
        print(f"title: {title}")
        print(f"granted_at: {format_local_time(granted_at)}")
        print(f"expires_at: {format_local_time(expires_at)}")
        print()


def main() -> int:
    try:
        access_token, account_id = load_credentials()
        payload = request_reset_credits(access_token, account_id)
        print_summary(payload)
        return 0

    except RuntimeError as exc:
        # 비밀값이나 원본 서버 응답은 출력하지 않는다.
        print(f"오류: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())