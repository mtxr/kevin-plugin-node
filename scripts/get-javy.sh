#!/bin/sh
# Downloads the Javy compiler into .tools/javy, checking a pinned sha256.
set -eu
VERSION=v9.1.0
cd "$(dirname "$0")/.."

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  PLATFORM=arm-macos;    SHA=99e9ec6a8e8c98e119d137c08a921d2443d3b873c675a5571e1800f4451e6294 ;;
  Darwin-x86_64) PLATFORM=x86_64-macos; SHA=6eed2927575dc2b3fb5a1563eee1ce0874e6da91c9cec39a728c9377a8cc7b5a ;;
  Linux-aarch64) PLATFORM=arm-linux;    SHA=826962f0e82354cf97d6e928ea36777872bbae76c626e326948e0367c4b55cb5 ;;
  Linux-x86_64)  PLATFORM=x86_64-linux; SHA=a68b122d48eb3dfc1b801d4e14c39271fde3638243d3272d206e376ac9189e39 ;;
  *) echo "get-javy: no Javy release for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

[ -x .tools/javy ] && exit 0
mkdir -p .tools
curl -fsSL -o .tools/javy.gz \
  "https://github.com/bytecodealliance/javy/releases/download/$VERSION/javy-$PLATFORM-$VERSION.gz"
echo "$SHA  .tools/javy.gz" | shasum -a 256 -c - >/dev/null || {
  echo "get-javy: checksum mismatch, refusing to use the download" >&2
  rm -f .tools/javy.gz
  exit 1
}
gunzip -f .tools/javy.gz
chmod +x .tools/javy
