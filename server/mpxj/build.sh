#!/usr/bin/env bash
# One-time build step for .mpp import support (POST /api/import/mpp in
# server.js). Requires a JDK (11+) and Maven — downloads MPXJ and its
# dependencies from Maven Central and shades them into one runnable jar at
# target/mpxj-convert-1.0.jar. Re-run any time that jar goes missing; it's
# gitignored on purpose (see the comment in pom.xml).
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v java >/dev/null; then
  echo "java not found — install a JDK (11+) first." >&2
  exit 1
fi
if ! command -v mvn >/dev/null; then
  echo "mvn (Maven) not found — install it first (e.g. 'brew install maven' or apt/yum equivalent)." >&2
  exit 1
fi

mvn -q package
echo "Built $(pwd)/target/mpxj-convert-1.0.jar"
