#!/bin/sh
set -eu

cd "/Users/treygoff/Code/prospera-team-dashboard"

if [ -f package.json ]; then
  npm install
fi
