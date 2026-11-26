#!/bin/sh
# Compiles src/plugin.js to dist/node.wasm.
#
# JAVY_PLUGIN, if set, is a QuickJS provider built without SIMD (see README:
# the provider Javy ships uses WebAssembly SIMD, which kevin's runtime does
# not enable).
set -eu
cd "$(dirname "$0")/.."
sh scripts/get-javy.sh
mkdir -p dist
if [ -n "${JAVY_PLUGIN:-}" ]; then
  set -- -C "plugin=$JAVY_PLUGIN"
else
  set --
fi
.tools/javy build "$@" \
  -J javy-stream-io=y -J text-encoding=y -C source=omitted \
  -o dist/node.wasm src/plugin.js
ls -l dist/node.wasm
