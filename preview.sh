#!/usr/bin/env bash
# Local preview of the site (same Jekyll setup as the online one).
# Usage: ./preview.sh      then open http://localhost:8080
# Edit files, save, and the page rebuilds; refresh the browser. Ctrl+C to stop.
cd "$(dirname "$0")"
docker compose up
