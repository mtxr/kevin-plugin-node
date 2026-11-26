#!/bin/sh
# Runs dist/node.wasm in a real kevin: converts, registers it, runs a task from
# package.json through .kevinrc, and checks that a failure explains itself.
#
#   KEVIN=/path/to/kevin sh scripts/e2e.sh [dist/node.wasm]
#
# The kevin must support WebAssembly SIMD (https://github.com/mtxr/kevin/pull/14).
set -eu
cd "$(dirname "$0")/.."
KEVIN=${KEVIN:?set KEVIN to a kevin binary}
WASM=$(cd "$(dirname "${1:-dist/node.wasm}")" && pwd)/$(basename "${1:-dist/node.wasm}")
FIXTURE=$PWD/test/fixtures/package.json

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail() { echo "e2e: $*" >&2; exit 1; }

# 1. Conversion: Markdown on stdout, a note for the renamed script on stderr.
"$KEVIN" --from "$WASM" -f "$FIXTURE" >"$tmp/out.md" 2>"$tmp/err" || fail "conversion failed: $(cat "$tmp/err")"
grep -q '^## > hello$' "$tmp/out.md" || fail "no task 'hello' in the output"
grep -q '^## > test-unit$' "$tmp/out.md" || fail "'test unit' was not renamed to 'test-unit'"
grep -q "script 'test unit' is the task 'test-unit'" "$tmp/err" || fail "the rename note is missing"

# 2. Registered, then used straight from package.json through .kevinrc.
export KEVIN_PLUGIN_DIR="$tmp/plugins"
"$KEVIN" --plugin-add "$WASM" >/dev/null || fail "--plugin-add failed"
mkdir "$tmp/project" && cp "$FIXTURE" "$tmp/project/package.json"
cd "$tmp/project"
echo 'package.json -> node' >.kevinrc
"$KEVIN" 2>&1 | grep -q 'hello' || fail "kevin does not list 'hello'"
[ "$("$KEVIN" hello | tail -n 1)" = "hello from script" ] || fail "the task did not run"

# 3. A package.json without scripts fails, and says why (not just 'unreachable').
echo '{}' >package.json
if "$KEVIN" >"$tmp/o" 2>"$tmp/e"; then fail "an empty package.json was accepted"; fi
grep -q 'no "scripts" object found' "$tmp/e" || fail "the error does not say why: $(cat "$tmp/e")"

echo "e2e: ok"
