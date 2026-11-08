// CSV and TSV: the delimiter, the rows (quotes per RFC 4180), and column widths.
// Pure (no Herdr imports), so tests/delimited.test.mjs runs it in node.

/** Tab for .tsv; for .csv, a semicolon when the first record has more of them than commas,
 *  counting only those outside quoted cells (a quoted cell may also span lines). */
export function delimiterOf(ext, text) {
  if (ext === "tsv") return "\t";
  let semicolons = 0, commas = 0, quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (c === "\n" || c === "\r") break;
    else if (c === ";") semicolons++;
    else if (c === ",") commas++;
  }
  return semicolons > commas ? ";" : ",";
}

/** Rows of cells, at most `limit` rows; `truncated` when there were more. */
export function parseDelimited(text, delimiter, limit = Infinity) {
  const rows = [];
  // `open`: the current record has begun (a quoted empty cell leaves `cell` and `row` empty).
  let row = [], cell = "", quoted = false, open = false, i = 0;
  const end = () => { row.push(cell); rows.push(row); row = []; cell = ""; open = false; };
  for (; i < text.length && rows.length < limit; i++) {
    const c = text[i];
    if (c !== "\n" && c !== "\r") open = true;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; end(); }
    else cell += c;
  }
  if (rows.length < limit && open) end();
  return { rows, truncated: i < text.length };
}

/** Pixel widths per column, one for each column of any row, from the longest cell among the
 *  first `sample` rows: a column only later rows have gets the narrowest width. */
export function columnWidths(rows, { sample = 200, char = 7.5, min = 48, max = 360 } = {}) {
  let count = 0;
  for (const row of rows) count = Math.max(count, row.length);
  const widths = new Array(count).fill(0);
  for (const row of rows.slice(0, sample)) row.forEach((cell, c) => { widths[c] = Math.max(widths[c], cell.length); });
  return widths.map((n) => Math.round(Math.min(max, Math.max(min, n * char + 20))));
}
