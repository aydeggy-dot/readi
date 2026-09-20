#!/usr/bin/env bash
# Rebuilds the Margin typefaces (ADR-0013) from the Fontsource packages with fonttools.
#   bash tools/trim-fonts.sh
#
# Output (apps/web/src/fonts):
#   alegreya-500.woff2, alegreya-sans-{400,700}.woff2          Latin, trimmed — 55.8 KB together
#   alegreya-naira-500.woff2, alegreya-sans-naira-{400,700}.woff2   U+20A6 only, ~1-3 KB each
#
# Re-running gives the same sizes; the serif files differ in bytes only by fonttools' timestamp, so
# commit a rebuild only when something actually changed. `pnpm --filter @readi/web test` enforces
# the 60 KB first-visit budget afterwards.
#
# Needs uv (uvx) and npm. Ported from design/explorations/tools/trim-fonts.sh, which built the same
# files for the mockups; that branch is not merged.
set -euo pipefail
cd "$(dirname "$0")/.."
out="$PWD/apps/web/src/fonts"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# The characters the app uses: Basic Latin, Latin-1, dotless i (the wordmark's "Readı" + pen tick),
# en and em dash, curly quotes, bullet, ellipsis. ₦ gets its own face so it is fetched only where
# a price is shown — no Latin subset of these families contains it.
chars="U+0020-007E,U+00A0-00FF,U+0131,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026"
# Kerning and ligatures, plus the numeral styles the readiness figures need, and case-sensitive
# forms so punctuation sits right next to capitals.
features="kern,liga,clig,calt,lnum,pnum,tnum,case"
ft() { uvx --quiet --from fonttools==4.60.1 --with brotli "$@"; }

(cd "$work" && npm pack --silent @fontsource-variable/alegreya@5.3.0 @fontsource/alegreya-sans@5.3.0 >/dev/null)
for t in "$work"/*.tgz; do mkdir -p "${t%.tgz}" && tar -xzf "$t" -C "${t%.tgz}"; done
serif="$work/fontsource-variable-alegreya-5.3.0/package/files"
sans="$work/fontsource-alegreya-sans-5.3.0/package/files"

# The serif ships at one weight only (Medium, 500), instanced out of the variable font: the mentor
# has one hand, and font-synthesis-weight:none stops the browser inventing another.
ft fonttools varLib.instancer "$serif/alegreya-latin-wght-normal.woff2" wght=500 -o "$work/a500.woff2" >/dev/null
ft pyftsubset "$work/a500.woff2" --unicodes="$chars" --layout-features="$features" --flavor=woff2 --output-file="$out/alegreya-500.woff2"
ft fonttools varLib.instancer "$serif/alegreya-latin-ext-wght-normal.woff2" wght=500 -o "$work/a500x.woff2" >/dev/null
ft pyftsubset "$work/a500x.woff2" --unicodes=U+20A6 --layout-features='*' --flavor=woff2 --output-file="$out/alegreya-naira-500.woff2"

for w in 400 700; do
  ft pyftsubset "$sans/alegreya-sans-latin-$w-normal.woff2" --unicodes="$chars" --layout-features="$features" --flavor=woff2 --output-file="$out/alegreya-sans-$w.woff2"
  ft pyftsubset "$sans/alegreya-sans-latin-ext-$w-normal.woff2" --unicodes=U+20A6 --layout-features='*' --flavor=woff2 --output-file="$out/alegreya-sans-naira-$w.woff2"
done

ls -l "$out"/*.woff2
