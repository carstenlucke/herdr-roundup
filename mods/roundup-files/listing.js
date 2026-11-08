// One folder's entries from sh, and their parsing. Pure, so tests/listing.test.mjs runs it
// against a real sh in node.
//
// The script's arguments: the folder. Per entry it prints its kind (d, f; a link: D, F, or B
// when it points nowhere) and its name, then an empty field, then each link's target as
// written, in the same order ("" where it can't be read). All fields end in NUL.
// The targets come from one readlink for all links, through xargs (macOS and GNU readlink
// take several paths; xargs splits a list too long for one call). They count only when it
// succeeds and prints exactly one line per link: then no target holds a line feed (but at
// its end, below) and none is empty. Otherwise (BusyBox's readlink takes one path, or there's no xargs) one readlink
// per link, keeping the line feeds inside a target. One at a target's end is lost: macOS's
// readlink adds none after it, so "a\n" and "a" print alike.
// Paths are set once from the glob and links marked by number (L<n>, each cleared first: the
// environment may hold one), and the loops over them
// call no function: bash copies "$@" when it grows by one and at every function call, so
// either costs it seconds at a few thousand links.
export const listScript = (most) => `root=$1; set -- "$root"/* "$root"/.[!.]* "$root"/..?*; nl='
'; n=0; i=0; last=0; links=0
for p do
  i=$((i+1)); eval "L$i="
  [ -e "$p" ] || [ -L "$p" ] || continue; name=\${p##*/}; [ "$name" = .git ] && continue
  if [ -d "$p" ]; then kind=d; else kind=f; fi
  if [ -L "$p" ]; then
    if [ ! -e "$p" ]; then kind=B; elif [ $kind = d ]; then kind=D; else kind=F; fi
    eval "L$i=1"; links=$((links+1))
  fi
  printf "%s\\0%s\\0" "$kind" "$name"; last=$i; n=$((n+1)); [ "$n" -ge ${most} ] && break
done
printf "\\0"
lines() { [ $# -eq "$links" ]; }
if [ "$links" -gt 0 ]; then
  ok=
  if batch=$(i=0; for p do i=$((i+1)); [ "$i" -gt "$last" ] && break; eval "f=\\\${L$i-}"; [ -n "$f" ] && printf "%s\\0" "$p"; done | xargs -0 readlink -- 2>/dev/null; rc=$?; printf .; exit "$rc"); then
    batch=\${batch%.}
    if [ $(printf %s "$batch" | wc -l) -eq "$links" ]; then set -f; IFS=$nl; lines $batch && ok=1; fi
  fi
  if [ -n "$ok" ]; then printf "%s\\0" $batch
  else
    i=0
    for p do
      i=$((i+1)); [ "$i" -gt "$last" ] && break; eval "f=\\\${L$i-}"; [ -n "$f" ] || continue
      to=$(readlink -- "$p" 2>/dev/null && printf .); case $to in *.) to=\${to%.}; to=\${to%"$nl"};; *) to=;; esac
      printf "%s\\0" "$to"
    done
  fi
fi
test -d "$root"`;

// [{ name, dir, link, broken }] from the script's output.
export function parseListing(stdout) {
  const fields = stdout.split("\0"), list = [], links = [];
  let i = 0;
  for (; i + 1 < fields.length && fields[i] !== ""; i += 2) {
    const kind = fields[i], link = "DFB".includes(kind);
    const e = { name: fields[i + 1], dir: kind === "d" || kind === "D", link: link ? "" : null, broken: kind === "B" };
    list.push(e);
    if (link) links.push(e);
  }
  i++;
  for (const e of links) e.link = fields[i++] ?? "";
  return list;
}
