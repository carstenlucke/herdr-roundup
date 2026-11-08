// CSV and TSV: the delimiter, the rows (quotes per RFC 4180), and column widths.
// Pure (no Herdr imports); this repo has no tests for it yet.

/** Tab for .tsv; for .csv, a semicolon when the first line has more of them than commas. */
export function delimiterOf(ext, text) {
  if (ext === "tsv") return "\t";
  const first = text.slice(0, text.indexOf("\n") + 1 || text.length);
  return (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
}

/** Rows of cells, at most `limit` rows; `truncated` when there were more. */
export function parseDelimited(text, delimiter, limit = Infinity) {
  const rows = [];
  let row = [], cell = "", quoted = false, i = 0;
  const end = () => { row.push(cell); rows.push(row); row = []; cell = ""; };
  for (; i < text.length && rows.length < limit; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; end(); }
    else cell += c;
  }
  if (rows.length < limit && (cell !== "" || row.length)) end();
  return { rows, truncated: i < text.length };
}

/** Pixel widths per column, from the longest cell among the first `sample` rows. */
export function columnWidths(rows, { sample = 200, char = 7.5, min = 48, max = 360 } = {}) {
  const widths = [];
  for (const row of rows.slice(0, sample)) row.forEach((cell, c) => { widths[c] = Math.max(widths[c] ?? 0, cell.length); });
  return widths.map((n) => Math.round(Math.min(max, Math.max(min, n * char + 20))));
}
