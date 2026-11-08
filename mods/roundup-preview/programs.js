// The programs behind image, PDF and text previews, one table per system, and parsers
// for what they print. Pure (no Herdr imports); this repo has no tests for it yet.
// macOS has sips and PDFKit built in; Linux gets sizes from `file` and PDF
// pages from poppler's pdftoppm and pdfinfo. Windows has neither sh nor file on Herdr's
// PATH, so its scripts are PowerShell, with WPF for sizes and Windows.Data.Pdf for pages.
import { powershell, win } from "./platform.js";
import { GONE } from "./text-file.js";

// A file's revision, digits only: its modification time to the nanosecond and its size, so
// a change within the same second still names a new copy. GNU stat goes first: BSD's -c fails
// without printing, while GNU's -f prints file-system details and fails.
const MTIME = String.raw`$({ stat -c '%y %s' "$src" 2>/dev/null || stat -f '%Fm %z' "$src"; } | tr -cd 0-9)`;

// sh: copies `src` into `dir` as <key>-<revision>.<ext> unless there already; prints the name.
// A copy already there is touched: the prune goes by age, and it is in use again.
const STAGE = String.raw`
src=$1 dir=$2 key=$3 ext=$4
[ -f "$src" ] || { echo "${GONE}" >&2; exit 1; }
name="$key-${MTIME}.$ext"
mkdir -p "$dir" || exit 1
if [ -f "$dir/$name" ]; then touch "$dir/$name" 2>/dev/null; else cp "$src" "$dir/$name" || exit 1; fi
echo "$name"`;

// sh: downloads `url` to <dir>/<key>.download (https only, 10 s, 5 MB); prints its MIME type.
const FETCH = String.raw`
url=$1 dir=$2 key=$3
mkdir -p "$dir" || exit 1
tmp="$dir/$key.download"
curl -sSfL --proto =https --proto-redir =https --max-time 10 --max-filesize 5242880 -o "$tmp" "$url" || { rm -f "$tmp"; exit 1; }
file -b --mime-type "$tmp"`;

// A file's revision, PowerShell's MTIME: its modification time in ticks (100 ns) and its size.
const STAMP = String.raw`('{0}{1}' -f [IO.File]::GetLastWriteTimeUtc($src).Ticks, ([IO.FileInfo]$src).Length)`;

// Moves $tmp, unique to this process, to $out. A move that can't overwrite tells when
// another render got there first, whose result is as good; -Force would delete it first.
const PLACE = String.raw`try { [IO.File]::Move($tmp, $out) } catch { if (-not [IO.File]::Exists($out)) { throw }; Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }`;

// $out, a copy or page already in the cache, dated now: the prune goes by age, and it is in use again.
const TOUCH = String.raw`try { [IO.File]::SetLastWriteTimeUtc($out, [DateTime]::UtcNow) } catch {}`;

// The bytes alone: [IO.File]::Copy keeps the source's date, read-only and hidden
// attributes, and the prune goes by age.
const STAGE_WINDOWS = String.raw`
$src, $dir, $key, $ext = $args
if (-not [IO.File]::Exists($src)) { throw '${GONE}' }
$name = $key + '-' + ${STAMP} + '.' + $ext
[void][IO.Directory]::CreateDirectory($dir)
$out = $dir + '\' + $name
if (-not [IO.File]::Exists($out)) {
  $tmp = $out + '.' + $PID + '.tmp'
  [IO.File]::WriteAllBytes($tmp, [IO.File]::ReadAllBytes($src))
  ${PLACE}
} else { ${TOUCH} }
$name`;

// `file --mime-type` for what the preview draws: the type of the bytes in $tmp. An SVG's
// tag opens the document: one further in is a web page holding a picture.
const SNIFF = String.raw`
$bytes = [IO.File]::ReadAllBytes($tmp)
$head = [BitConverter]::ToString($bytes, 0, [Math]::Min(12, $bytes.Length)).Replace('-', '').ToLower()
$text = [Text.Encoding]::UTF8.GetString($bytes, 0, [Math]::Min(4096, $bytes.Length))
if ($head -match '^89504e47') { 'image/png' }
elseif ($head -match '^ffd8ff') { 'image/jpeg' }
elseif ($head -match '^47494638') { 'image/gif' }
elseif ($head -match '^52494646.{8}57454250') { 'image/webp' }
elseif ($text -match '^\uFEFF?(?s:\s|<\?xml.*?\?>|<!--.*?-->|<!doctype\s+svg[^>]*>)*<(?:[\w.-]+:)?svg\b') { 'image/svg+xml' }
else { 'application/octet-stream' }`;

// curl.exe ships with Windows.
const FETCH_WINDOWS = String.raw`
$url, $dir, $key = $args
[void][IO.Directory]::CreateDirectory($dir)
$tmp = $dir + '\' + $key + '.download'
$null = & ($env:SystemRoot + '\System32\curl.exe') -sSfL --proto =https --proto-redir =https --max-time 10 --max-filesize 5242880 -o $tmp $url
if ($LASTEXITCODE -ne 0) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue; exit 1 }
${SNIFF}`;

const SIZE_WINDOWS = String.raw`
Add-Type -AssemblyName PresentationCore
$stream = [IO.File]::OpenRead($args[0])
try {
  $frame = [Windows.Media.Imaging.BitmapDecoder]::Create($stream, 'DelayCreation', 'None').Frames[0]
  'pixelWidth: ' + $frame.PixelWidth
  'pixelHeight: ' + $frame.PixelHeight
} finally { $stream.Dispose() }`;

const HEAD_WINDOWS = String.raw`
$stream = [IO.File]::OpenRead($args[0])
try {
  $bytes = New-Object byte[] ([Math]::Min($stream.Length, [long]$args[1]))
  $read = $stream.Read($bytes, 0, $bytes.Length)
  $out = [Console]::OpenStandardOutput()
  $out.Write($bytes, 0, $read)
  $out.Flush()
} finally { $stream.Dispose() }`;

const PRUNE_WINDOWS = String.raw`
$old = (Get-Date).AddDays(-14)
Get-ChildItem -LiteralPath $args[0] -File -Force | Where-Object { $_.LastWriteTime -lt $old } | Remove-Item -Force -ErrorAction SilentlyContinue`;

/** { width, height } from sips or `file -b` output; zeros when it names no size. */
export function pictureSize(text) {
  const sips = (axis) => Number(text.match(new RegExp(`pixel${axis}: (\\d+)`))?.[1] ?? 0);
  if (text.includes("pixelWidth")) return { width: sips("Width"), height: sips("Height") };
  // `file` prints "480 x 270" (PNG, GIF, BMP) or "480x270" (JPEG, WebP), beside a
  // JPEG's "density 1x1" and a BMP's "resolution 2835 x 2835 px/m".
  for (const m of text.matchAll(/(\d+) ?x ?(\d+)/g)) {
    if (/density $/.test(text.slice(0, m.index)) || /^ ?px/.test(text.slice(m.index + m[0].length))) continue;
    return { width: Number(m[1]), height: Number(m[2]) };
  }
  return { width: 0, height: 0 };
}

// JavaScript for Automation (osascript -l JavaScript): renders pages with PDFKit, prints JSON.
const PDFKIT = String.raw`
ObjC.import('Foundation'); ObjC.import('AppKit'); ObjC.import('PDFKit');
function run(argv) {
  var source = argv[0], dir = argv[1], key = argv[2], from = Number(argv[3]), to = Number(argv[4]), wide = Number(argv[5]);
  var fm = $.NSFileManager.defaultManager;
  var attrs = fm.attributesOfItemAtPathError($(source), null);
  if (!attrs || attrs.isNil()) throw new Error('${GONE}');
  var stamp = String(Math.round(ObjC.unwrap(attrs.objectForKey($.NSFileModificationDate).timeIntervalSince1970) * 1e6)) + String(ObjC.unwrap(attrs.objectForKey($.NSFileSize)));
  var doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath($(source)));
  if (!doc || doc.isNil()) throw new Error('This PDF cannot be read');
  if (doc.isLocked) throw new Error('This PDF is password protected');
  var count = Number(doc.pageCount), pages = [];
  fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(dir), true, $(), null);
  for (var n = Math.max(1, from); n <= Math.min(to, count); n++) {
    var name = key + '-' + stamp + '-p' + n + '.png', path = dir + '/' + name;
    var page = doc.pageAtIndex(n - 1), box = page.boundsForBox(1), turned = Number(page.rotation) % 180 !== 0;
    var w = turned ? box.size.height : box.size.width, h = turned ? box.size.width : box.size.height;
    if (!fm.fileExistsAtPath($(path))) {
      var picture = page.thumbnailOfSizeForBox($.NSMakeSize(wide, wide * h / w), 1);
      var bitmap = $.NSBitmapImageRep.imageRepWithData(picture.TIFFRepresentation);
      var png = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
      if (!png.writeToFileAtomically($(path), true)) throw new Error('Cannot save page ' + n);
    } else fm.setAttributesOfItemAtPathError($({ NSFileModificationDate: $.NSDate.date }), $(path), null); // in use again: the prune goes by age
    pages.push({ n: n, path: 'data/roundup-preview/' + name, width: w, height: h });
  }
  return JSON.stringify({ count: count, pages: pages });
}`;

// sh: renders pages from..to with pdftoppm into <dir>/<key>-<revision>-p<n>.png; prints what popplerPages reads.
const POPPLER = String.raw`
src=$1 dir=$2 key=$3 from=$4 to=$5 wide=$6
[ -f "$src" ] || { echo "${GONE}" >&2; exit 1; }
command -v pdftoppm >/dev/null && command -v pdfinfo >/dev/null || { echo "PDF previews need pdftoppm and pdfinfo (poppler-utils)" >&2; exit 1; }
stamp=${MTIME}
info=$(pdfinfo "$src" 2>&1) || { echo "$info" >&2; exit 1; }
count=$(printf '%s\n' "$info" | sed -n 's/^Pages: *//p')
[ "$from" -ge 1 ] || from=1
[ "$to" -le "$count" ] || to=$count
mkdir -p "$dir" || exit 1
n=$from
while [ "$n" -le "$to" ]; do
  out="$dir/$key-$stamp-p$n"
  if [ -f "$out.png" ]; then touch "$out.png" 2>/dev/null
  else pdftoppm -png -f "$n" -l "$n" -scale-to-x "$wide" -scale-to-y -1 -singlefile "$src" "$out" || exit 1; fi
  n=$((n + 1))
done
echo "Stamp: $stamp"
echo "Pages: $count"
if [ "$from" -le "$to" ]; then pdfinfo -f "$from" -l "$to" "$src"; fi`;

// Windows.Data.Pdf through WinRT, whose async calls PowerShell can only wait on as tasks.
// Prints what PDFKIT prints; sizes are in DIPs, of which only the ratio is used.
const PDF_WINDOWS = String.raw`
$src, $dir, $key, $from, $to, $wide = $args
if (-not [IO.File]::Exists($src)) { throw '${GONE}' }
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$tasks = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 }
$operation = $tasks | Where-Object { $_.IsGenericMethod -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation?1' }
$action = $tasks | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' }
function Get-Result($call, $type) { $operation.MakeGenericMethod($type).Invoke($null, @($call)).GetAwaiter().GetResult() }
try {
  $file = Get-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($src)) ([Windows.Storage.StorageFile])
  $doc = Get-Result ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
} catch {
  $e = $_.Exception
  while ($e.InnerException) { $e = $e.InnerException }
  if ($e.HResult -eq -2147023573) { throw 'This PDF is password protected' }
  throw 'This PDF cannot be read'
}
$count = [int]$doc.PageCount
$stamp = ${STAMP}
[void][IO.Directory]::CreateDirectory($dir)
$pages = @()
for ($n = [Math]::Max(1, [int]$from); $n -le [Math]::Min([int]$to, $count); $n++) {
  $page = $doc.GetPage($n - 1)
  $name = $key + '-' + $stamp + '-p' + $n + '.png'
  $out = $dir + '\' + $name
  if (-not [IO.File]::Exists($out)) {
    $tmp = $out + '.' + $PID + '.tmp'
    $stream = [IO.File]::Open($tmp, 'Create', 'ReadWrite')
    $options = New-Object Windows.Data.Pdf.PdfPageRenderOptions
    $options.DestinationWidth = [uint32]$wide
    $null = $action.Invoke($null, @($page.RenderToStreamAsync([System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($stream), $options))).GetAwaiter().GetResult()
    $stream.Dispose()
    ${PLACE}
  } else { ${TOUCH} }
  $pages += @{ n = $n; path = 'data/roundup-preview/' + $name; width = $page.Size.Width; height = $page.Size.Height }
  $page.Dispose()
}
@{ count = $count; pages = $pages } | ConvertTo-Json -Compress -Depth 4`;

/** The POPPLER script's output as PDFKIT's: { count, pages: [{ n, path, width, height }] }, sizes in points. */
export function popplerPages(text, key) {
  const stamp = text.match(/^Stamp: (\d+)/m)?.[1], count = Number(text.match(/^Pages:\s*(\d+)/m)?.[1] ?? 0);
  const turned = new Set([...text.matchAll(/^Page\s+(\d+) rot:\s*(\d+)/gm)].filter((m) => Number(m[2]) % 180 !== 0).map((m) => Number(m[1])));
  const pages = [...text.matchAll(/^Page\s+(\d+) size:\s*([\d.]+) x ([\d.]+)/gm)].map(([, page, w, h]) => {
    const n = Number(page), [width, height] = turned.has(n) ? [Number(h), Number(w)] : [Number(w), Number(h)];
    return { n, path: `data/roundup-preview/${key}-${stamp}-p${n}.png`, width, height };
  });
  return { count, pages };
}

const failed = (message) => { throw new Error(message.trim() || "Cannot render this PDF"); };

// Each command is [program, args]. `remote` is a file on another machine, always sh.
const POSIX = {
  stage: (src, dir, key, ext) => ["sh", ["-c", STAGE, "stage", src, dir, key, ext]],
  fetch: (url, dir, key) => ["sh", ["-c", FETCH, "fetch", url, dir, key]],
  mime: (file) => ["file", ["-b", "--mime-type", file]],
  size: (file) => ["file", ["-b", file]],
  bytes: (file) => ["sh", ["-c", 'wc -c < "$1"', "size", file]],
  stamp: (file) => ["sh", ["-c", `src=$1; [ -f "$src" ] && echo ${MTIME}`, "stamp", file]],
  realDir: (dir) => ["sh", ["-c", 'cd "$1" && pwd -P', "real", dir]],
  head: (file, bytes) => ["sh", ["-c", 'head -c "$2" "$1"', "head", file, String(bytes)]],
  prune: (dir) => ["find", [dir, "-type", "f", "-mtime", "+14", "-delete"]],
  move: (from, to) => ["mv", ["-f", from, to]],
  remove: (file) => ["rm", ["-f", file]],
  pdf: (file, dir, key, from, to, wide) => ["sh", ["-c", POPPLER, "pdf", file, dir, key, String(from), String(to), String(wide)]],
  pages: (r, key) => r.code === 0 ? popplerPages(r.stdout, key) : failed(/password/i.test(r.stderr) ? "This PDF is password protected" : r.stderr),
};

const MACOS = { ...POSIX,
  size: (file) => ["sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]],
  pdf: (file, dir, key, from, to, wide) => ["osascript", ["-l", "JavaScript", "-e", PDFKIT, file, dir, key, String(from), String(to), String(wide)]],
  pages: (r) => r.code === 0 ? JSON.parse(r.stdout.trim()) : failed(r.stderr.replace(/^.*execution error: (Error: )?/s, "").replace(/ \(-?\d+\)\s*$/, "")),
};

const WINDOWS = {
  stage: (src, dir, key, ext) => powershell(STAGE_WINDOWS, win(src), win(dir), key, ext),
  fetch: (url, dir, key) => powershell(FETCH_WINDOWS, url, win(dir), key),
  mime: (file) => powershell(`$tmp = $args[0]\n${SNIFF}`, win(file)),
  size: (file) => powershell(SIZE_WINDOWS, win(file)),
  bytes: (file) => powershell("(Get-Item -LiteralPath $args[0]).Length", win(file)),
  stamp: (file) => powershell(`$src = $args[0]\n${STAMP}`, win(file)),
  realDir: null,
  head: (file, bytes) => powershell(HEAD_WINDOWS, win(file), String(bytes)),
  prune: (dir) => powershell(PRUNE_WINDOWS, win(dir)),
  move: (from, to) => powershell("Move-Item -LiteralPath $args[0] -Destination $args[1] -Force", win(from), win(to)),
  remove: (file) => powershell("Remove-Item -LiteralPath $args[0] -Force -ErrorAction SilentlyContinue", win(file)),
  pdf: (file, dir, key, from, to, wide) => powershell(PDF_WINDOWS, win(file), win(dir), key, String(from), String(to), String(wide)),
  pages: (r) => r.code === 0 ? JSON.parse(r.stdout.trim()) : failed(r.stderr),
};

/** The programs for `system`, a value of systemOf. */
export const programs = (system) => system === "windows" ? WINDOWS : system === "macos" ? MACOS : POSIX;

/** What a PDF command's result { code, stdout, stderr } rendered: { count, pages }, its paths checked. */
export function pdfPages(system, result, key) {
  const out = programs(system).pages(result, key);
  if (!Array.isArray(out.pages) || out.pages.some((p) => !p.path.startsWith("data/roundup-preview/"))) throw new Error("The PDF renderer returned something unexpected");
  return out;
}
