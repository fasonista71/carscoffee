#!/usr/bin/env bash
#
# Builds the itch.io bundle from the working tree.
#
#   bash tools/build-itch.sh
#
# What it does and why:
#
#  * Builds into a fresh _dist/build-<TAG>/ every time and never
#    copies over the top of a previous build. The old flow reused one
#    directory, which is how probe.html and a set of .DS_Store files
#    ended up inside the dist tree. A build directory that did not
#    exist a second ago cannot contain a leftover.
#
#  * Renames src/ to src-<BUILD_TAG>/ inside the bundle and points the
#    one script tag at it. This is the cache busting. itch serves an
#    in place update at the same urls, so a browser holding the old
#    modules can otherwise mix them with new ones, which has already
#    happened once on this project (CLAUDE.md, mixed cache note).
#    Every import inside the tree is relative, so moving the whole
#    directory versions all twenty of them at once with no rewriting.
#
#  * Leaves devOverlay.js out. It is dynamically imported behind
#    ?dev and the import has a catch, so its absence is the off
#    switch rather than an error.
#
#  * Derives the shipped index.html from the repo root index.html by
#    exactly one substitution, so the two cannot drift on anything
#    else. They used to be separate files maintained by hand.
#
#  * Names the zip after the build tag. Nothing is ever overwritten,
#    so the previous zip stays on disk as the rollback.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TAG="$(sed -n "s/^export const BUILD_TAG = '\(.*\)';$/\1/p" src/game/tuning.js)"
VERSION="$(sed -n 's/.*"version": "\(.*\)".*/\1/p' package.json)"
[ -n "$TAG" ] || { echo "could not read BUILD_TAG from src/game/tuning.js" >&2; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
BUILD="_dist/build-$TAG-$STAMP"
OUT="$BUILD/cars-and-coffee-web"
SRCDIR="src-$TAG"
ZIP="$BUILD/cars-and-coffee-web-$TAG.zip"

echo "building Cars & Coffee $VERSION ($TAG)"

mkdir -p "$OUT/$SRCDIR" "$OUT/assets"

# Source, minus the dev overlay and minus macOS litter.
while IFS= read -r f; do
  case "$f" in
    ./app/devOverlay.js) continue ;;
  esac
  mkdir -p "$OUT/$SRCDIR/$(dirname "$f")"
  cp "src/$f" "$OUT/$SRCDIR/$f"
done < <(cd src && find . -name '*.js' | sort)

# Assets the loader actually asks for, named explicitly so a stray
# file in assets/ never rides along.
for f in cars.atlas cars.png coffee.png badge.png CARS_CREDITS.txt; do
  cp "assets/$f" "$OUT/assets/$f"
done

# The entry page: root index.html with the source directory versioned.
sed 's#\./src/app/main\.js#./'"$SRCDIR"'/app/main.js#' index.html > "$OUT/index.html"

grep -q "$SRCDIR/app/main.js" "$OUT/index.html" \
  || { echo "the script tag substitution did not take; check index.html" >&2; exit 1; }
grep -q '\./src/app/main\.js' "$OUT/index.html" \
  && { echo "an unversioned src/ reference survived in index.html" >&2; exit 1; }
[ -e "$OUT/$SRCDIR/app/devOverlay.js" ] \
  && { echo "devOverlay.js made it into the bundle" >&2; exit 1; }

# python's zipfile rather than the zip command: zip writes a temp
# file and renames over the target, and this folder is mounted
# without delete permission, so that rename fails. A single create
# does not need one.
python3 - "$BUILD" "cars-and-coffee-web-$TAG.zip" <<'PYZIP'
import os, sys, zipfile
build, name = sys.argv[1], sys.argv[2]
root = os.path.join(build, 'cars-and-coffee-web')
with zipfile.ZipFile(os.path.join(build, name), 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for fn in sorted(filenames):
            if fn == '.DS_Store':
                continue
            full = os.path.join(dirpath, fn)
            z.write(full, os.path.relpath(full, build))
PYZIP

echo
echo "contents:"
( cd "$OUT" && find . -type f | sort | sed 's/^/  /' )
echo
echo "zip: $ROOT/$ZIP"
ls -lh "$ZIP" | awk '{print "  size: " $5}'
echo "  md5: $( (md5sum "$ZIP" 2>/dev/null || md5 -q "$ZIP") | awk '{print $1}' )"
