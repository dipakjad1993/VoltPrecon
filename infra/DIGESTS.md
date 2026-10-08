# VoltPrecon image digests — supply-chain receipts (refresh cadence: monthly).
#
# Base images are pinned by TAG in infra/Dockerfile (node:20-slim, python:3.12-slim)
# and resolved to DIGESTS at every CI build (see .github/workflows/ci.yml
# "record image digests" step, whose output is committed here by the monthly
# rebuild job). Pinning a digest you never re-resolve is security theater; a
# monthly resolve-and-record cadence is a supply chain.
#
# Refresh manually:
#   docker buildx imagetools inspect node:20-slim --format '{{json .Manifest}}'
#   docker buildx imagetools inspect python:3.12-slim --format '{{json .Manifest}}'
#
# Last resolved: 2026-10-08 (CI RECORD — tags only; digests recorded per-build in CI logs)
#   node:20-slim   -> (see CI log "image digests" — resolved at build time)
#   python:3.12-slim -> (see CI log "image digests" — resolved at build time)
