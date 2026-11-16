#!/bin/sh
set -eu
cd "$(dirname "$0")"
rm -rf dist
mkdir -p dist
cp index.html styles.css app.js manus-routes.json dist/
