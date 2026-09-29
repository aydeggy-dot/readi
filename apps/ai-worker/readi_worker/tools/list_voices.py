"""Which voices the synthesizer offers for a given accent — the phase-7 panel's shortlist.

    uv run python -m readi_worker.tools.list_voices --accent nigerian

**Why this is a tool and not a curl.** The key is read from the configuration the worker already
reads, so it never appears on a command line, in a shell history or in a transcript — which is
CLAUDE.md §7.9 from the other side. Nothing here prints it, and the guard that refuses to open a
secret file is not being worked around: a program is entitled to read its own configuration.

It is read-only and free: listing shared voices synthesizes nothing and bills nothing. It exists
because ElevenLabs publishes `nigerian` as a filterable accent but refuses anonymous filtering, so
the only way to learn whether the panel has two candidates or forty is to ask with a key.

What to look at, for the phase-7 decision (`docs/plans/m5-voice.md` decision 10):

- `notice` — a Voice Library voice is somebody else's Professional Voice Clone and they may withdraw
it.
  Audio already generated survives a withdrawal for good; **live synthesis does not**, past the
  notice
  period. A long notice period is worth more than a marginally nicer voice, and pre-rendering the
  interviewer's fixed lines is the insurance either way.
- `rate` — some library voices carry a credit multiplier, so a 2x voice doubles the bill.
- `category` — professional clones are the slowest class to synthesize, which matters on the live
path
  and not at all for the pre-rendered lines.
"""

import argparse
import asyncio
import json
import sys

import httpx2

from readi_worker.settings import SettingsError, load_settings

BASE_URL = "https://api.elevenlabs.io"
SHARED_VOICES = "/v1/shared-voices"
ACCENTS = "/v1/voices/accents"


async def main() -> int:
    parser = argparse.ArgumentParser(description="List shared ElevenLabs voices by accent.")
    parser.add_argument("--accent", default="nigerian", help="accent filter (default: nigerian)")
    parser.add_argument("--language", default="en")
    parser.add_argument("--accents", action="store_true", help="list available accents instead")
    parser.add_argument("--json", action="store_true", help="print the raw rows as JSON")
    args = parser.parse_args()

    try:
        settings = load_settings()
    except SettingsError as exc:
        print(exc, file=sys.stderr)
        return 2

    key = settings.elevenlabs_api_key
    if key is None:
        print("ELEVENLABS_API_KEY is not configured for the worker", file=sys.stderr)
        return 2

    headers = {"xi-api-key": key.get_secret_value()}
    async with httpx2.AsyncClient(timeout=30.0) as client:
        if args.accents:
            response = await client.get(f"{BASE_URL}{ACCENTS}", headers=headers)
            if response.status_code != 200:
                print(f"ElevenLabs answered {response.status_code}", file=sys.stderr)
                return 1
            payload = response.json()
            rows = payload if isinstance(payload, list) else payload.get("accents", [])
            for row in rows:
                print(f"{row.get('code', '?'):<24} {row.get('name', '?')}")
            return 0

        response = await client.get(
            f"{BASE_URL}{SHARED_VOICES}",
            headers=headers,
            params={
                "accent": args.accent,
                "language": args.language,
                "page_size": 100,
                "include_custom_rates": "false",
            },
        )
        if response.status_code != 200:
            # No body printed: an error page from a vendor is not something to put in a log unread.
            print(f"ElevenLabs answered {response.status_code}", file=sys.stderr)
            return 1
        payload = response.json()

    voices = payload.get("voices", []) if isinstance(payload, dict) else []
    if args.json:
        print(json.dumps(voices, indent=2))
        return 0

    total = payload.get("total_count", len(voices)) if isinstance(payload, dict) else len(voices)
    print(f"{len(voices)} of {total} voice(s): accent={args.accent} language={args.language}\n")
    header = f"{'voice_id':<24} {'name':<22} {'category':<12} {'notice':>7} {'rate':>5}  use case"
    print(header)
    print("-" * len(header))
    for voice in voices:
        use_case = voice.get("use_case") or voice.get("use_cases") or ""
        if isinstance(use_case, list):
            use_case = ", ".join(str(item) for item in use_case)
        notice = voice.get("notice_period", voice.get("notice_period_days", "-"))
        print(
            f"{voice.get('voice_id', '?')!s:<24} "
            f"{str(voice.get('name', '?'))[:22]:<22} "
            f"{str(voice.get('category', '?'))[:12]:<12} "
            f"{notice!s:>7} "
            f"{voice.get('rate', '-')!s:>5}  "
            f"{str(use_case)[:40]}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
