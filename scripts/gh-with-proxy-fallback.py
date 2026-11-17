#!/usr/bin/env python3
"""Run GitHub CLI with an explicit, safe fallback for a stopped local proxy."""

from __future__ import annotations

import os
import socket
import sys
from collections.abc import Callable, Mapping
from urllib.parse import urlsplit
import shutil

PROXY_KEYS = (
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
)
PROBE_ORDER = (
    "https_proxy",
    "HTTPS_PROXY",
    "http_proxy",
    "HTTP_PROXY",
    "all_proxy",
    "ALL_PROXY",
)
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _can_connect(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.4):
            return True
    except OSError:
        return False


def _proxy_endpoint(url: str) -> tuple[str, int] | None:
    parsed = urlsplit(url if "://" in url else f"http://{url}")
    if not parsed.hostname:
        return None
    default_ports = {"http": 80, "https": 443, "socks4": 1080, "socks5": 1080, "socks5h": 1080}
    try:
        port = parsed.port or default_ports.get(parsed.scheme, 80)
    except ValueError:
        return None
    return parsed.hostname, port


def prepare_environment(
    environment: Mapping[str, str],
    probe: Callable[[str, int], bool] = _can_connect,
) -> tuple[dict[str, str], str | None]:
    env = dict(environment)
    proxy_url = next((env[key] for key in PROBE_ORDER if env.get(key)), None)
    if not proxy_url:
        return env, None
    endpoint = _proxy_endpoint(proxy_url)
    if endpoint is None or endpoint[0] not in LOOPBACK_HOSTS:
        return env, None
    host, port = endpoint
    if probe(host, port):
        return env, None
    for key in PROXY_KEYS:
        env.pop(key, None)
    return env, f"local proxy {host}:{port} is unreachable; using direct connection"


def _find_gh(environment: Mapping[str, str]) -> str | None:
    candidates = [
        environment.get("GH_BIN"),
        "/opt/homebrew/bin/gh",
        "/usr/local/bin/gh",
        shutil.which("gh"),
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def main() -> int:
    environment, warning = prepare_environment(os.environ)
    if warning:
        print(f"[gh-with-proxy-fallback] {warning}", file=sys.stderr)
    binary = _find_gh(environment)
    if not binary:
        print("[gh-with-proxy-fallback] GitHub CLI not found; set GH_BIN to its absolute path", file=sys.stderr)
        return 127
    try:
        os.execvpe(binary, [binary, *sys.argv[1:]], environment)
    except OSError as error:
        print(f"[gh-with-proxy-fallback] unable to execute {binary}: {error}", file=sys.stderr)
        return 126


if __name__ == "__main__":
    raise SystemExit(main())
