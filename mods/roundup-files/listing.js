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
//
// `budget`: the most bytes it prints, names and NULs counted (exec takes 8 MiB); 4 at least,
// its frame. LC_ALL=C
// after the glob makes ${#x} count bytes. An entry is printed only whole, with a NUL held back
// for a link's target; past the budget the entries end there, marked by a "+" record
// (cut: the folder held more). A target is printed whole if it fits in what is left, else
// as "" (a link without a known target): never a part of a path, and each link keeps its
// field. Its kind came from the real target before.
//
// A link that points nowhere may only be out of reach: a folder on its way that you may not
// search (EACCES) hides whether its target is there. For the first BLOCKED_AT_MOST of them its
// real target (before the budget may leave it out) is walked back, in the shell, to the
// nearest path there is: a folder you can't search makes the link blocked; a link on the way
// that points nowhere is followed (readlink, at most HOPS of them; what a followed link led to
// is remembered, but not when HOPS cut the walk short, nor for a path with a line feed),
// anything else leaves it broken. A blocked link's number (1 for the first link)
// follows the targets as a field, its bytes held back with the entry. Not for a target that
// can't be read. The numbers to walk are kept in order in $walks and taken from its front, and
// the targets in W<n>, set before they're read: not one eval per link.
export const BLOCKED_AT_MOST = 200, HOPS = 8;
export const listScript = (most, budget) => `root=$1; set -- "$root"/* "$root"/.[!.]* "$root"/..?*; LC_ALL=C; export LC_ALL; nl='
'; n=0; i=0; last=0; links=0; rem=$((${budget}-4)); cut=; nb=0; walks=$nl; wk=; blocked=
for p do
  i=$((i+1)); eval "L$i="
  [ -e "$p" ] || [ -L "$p" ] || continue; name=\${p##*/}; [ "$name" = .git ] && continue
  if [ -d "$p" ]; then kind=d; else kind=f; fi
  c=$((\${#name}+3)); walk=
  if [ -L "$p" ]; then
    c=$((c+1))
    if [ ! -e "$p" ]; then kind=B; [ "$nb" -lt ${BLOCKED_AT_MOST} ] && { walk=$((links+1)); c=$((c+\${#walk}+1)); }
    elif [ $kind = d ]; then kind=D; else kind=F; fi
  fi
  if [ "$c" -gt "$rem" ]; then cut=1; break; fi
  rem=$((rem-c))
  case $kind in [DF]) eval "L$i=1"; links=$((links+1));; B) eval "L$i=1"; links=$((links+1)); [ -n "$walk" ] && { walks=$walks$links$nl; nb=$((nb+1)); };; esac
  printf "%s\\0%s\\0" "$kind" "$name"; last=$i; n=$((n+1)); [ "$n" -ge ${most} ] && break
done
[ -n "$cut" ] && printf "+\\0\\0"
printf "\\0"
lines() { [ $# -eq "$links" ]; }
if [ "$links" -gt 0 ]; then
  ok=
  if batch=$(i=0; for p do i=$((i+1)); [ "$i" -gt "$last" ] && break; eval "f=\\\${L$i-}"; [ -n "$f" ] && printf "%s\\0" "$p"; done | xargs -0 readlink -- 2>/dev/null; rc=$?; printf .; exit "$rc"); then
    batch=\${batch%.}
    if [ $(printf %s "$batch" | wc -l) -eq "$links" ]; then set -f; IFS=$nl; lines $batch && ok=1; fi
  fi
  if [ -n "$ok" ] && [ $((\${#batch}-links)) -le "$rem" ]; then
    printf "%s\\0" $batch
    if [ "$nb" -gt 0 ]; then k=0; for to in $batch; do k=$((k+1)); case $walks in "$nl$k$nl"*) walks=\${walks#"$nl$k"}; [ -n "$to" ] && { eval "W$k=\\$to"; wk=$wk$nl$k; };; esac; done; fi
  elif [ -n "$ok" ]; then
    k=0
    for to in $batch; do
      k=$((k+1)); case $walks in "$nl$k$nl"*) walks=\${walks#"$nl$k"}; [ -n "$to" ] && { eval "W$k=\\$to"; wk=$wk$nl$k; };; esac
      if [ \${#to} -le "$rem" ]; then rem=$((rem-\${#to})); else to=; fi
      printf "%s\\0" "$to"
    done
  else
    i=0; k=0
    for p do
      i=$((i+1)); [ "$i" -gt "$last" ] && break; eval "f=\\\${L$i-}"; [ -n "$f" ] || continue
      k=$((k+1)); case $walks in "$nl$k$nl"*) walks=\${walks#"$nl$k"}; b=1;; *) b=;; esac; to=
      if [ "$rem" -gt 0 ] || [ -n "$b" ]; then
        to=$(readlink -- "$p" 2>/dev/null && printf .); case $to in *.) to=\${to%.}; to=\${to%"$nl"};; *) to=;; esac
        [ -n "$b" ] && [ -n "$to" ] && { eval "W$k=\\$to"; wk=$wk$nl$k; }
        if [ \${#to} -le "$rem" ]; then rem=$((rem-\${#to})); else to=; fi
      fi
      printf "%s\\0" "$to"
    done
  fi
  set -f; IFS=$nl; memo=$nl
  for k in $wk; do
    eval "t=\\$W$k"; d=$root; hop=0; seen=; st=; ab=
    while [ -z "$st" ]; do
      case $t in /*) q=$t;; *) q=$d/$t;; esac
      while :; do
        if [ -e "$q" ]; then if [ -d "$q" ] && [ ! -x "$q" ]; then st=b; else st=x; fi; break; fi
        if [ -L "$q" ]; then
          case $q in *"$nl"*) ;; *) case $memo in *"$nl"b"$q$nl"*) st=b; break;; *"$nl"x"$q$nl"*) st=x; break;; esac;; esac
          hop=$((hop+1)); if [ "$hop" -gt ${HOPS} ]; then st=x; ab=1; break; fi
          t=$(readlink -- "$q" 2>/dev/null && printf .); case $t in *.) t=\${t%.}; t=\${t%"$nl"};; *) t=;; esac
          if [ -z "$t" ]; then st=x; break; fi
          case $q in *"$nl"*) ;; *) seen=$seen$q$nl;; esac
          d=\${q%/*}; [ -n "$d" ] || d=/; break
        fi
        case $q in */*) q=\${q%/*}; [ -n "$q" ] || q=/;; *) st=x; break;; esac
      done
    done
    [ -z "$ab" ] && for q in $seen; do [ $((\${#memo}+\${#q})) -lt 16384 ] && memo=$memo$st$q$nl; done
    [ $st = b ] && blocked=$blocked$nl$k
  done
  for k in $blocked; do printf "%s\\0" "$k"; done
fi
test -d "$root"`;

// { entries: [{ name, dir, link, broken, blocked }], cut } from the script's output (cut: the
// budget ended the entries; blocked: a link that points nowhere one can see, past a folder one
// may not search, so it isn't broken).
export function parseListing(stdout) {
  const fields = stdout.split("\0"), list = [], links = [];
  let i = 0, cut = false;
  for (; i + 1 < fields.length && fields[i] !== ""; i += 2) {
    const kind = fields[i], link = "DFB".includes(kind);
    if (kind === "+") { cut = true; continue; }
    const e = { name: fields[i + 1], dir: kind === "d" || kind === "D", link: link ? "" : null, broken: kind === "B", blocked: false };
    list.push(e);
    if (link) links.push(e);
  }
  i++;
  for (const e of links) e.link = fields[i++] ?? "";
  for (; i < fields.length; i++) {
    const e = /^\d+$/.test(fields[i]) ? links[Number(fields[i]) - 1] : null;
    if (e?.broken) Object.assign(e, { broken: false, blocked: true });
  }
  return { entries: list, cut };
}
