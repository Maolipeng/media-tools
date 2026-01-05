#!/usr/bin/env sh
set -eu

if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    docker compose up -d --build
    exit 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose up -d --build
    exit 0
  fi
fi

echo "Docker Compose 未安装或不可用。请先安装 Docker Desktop/Engine。" >&2
exit 1
