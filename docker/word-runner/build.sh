#!/usr/bin/env bash
set -euo pipefail

IMAGE="${DOCKER_RUNNER_IMAGE:-word-runner:latest}"
NETWORK="${DOCKER_RUNNER_NETWORK:-word-isolated}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Building $IMAGE from $REPO_ROOT ..."
docker build -f "$SCRIPT_DIR/Dockerfile" -t "$IMAGE" "$REPO_ROOT"

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  echo "Creating docker network $NETWORK"
  docker network create "$NETWORK"
fi

echo "Done: $IMAGE (network: $NETWORK)"
