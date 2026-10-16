// Small RFC 4180 CSV parser: quoted fields, "" escapes, newlines inside quotes, CRLF, BOM.
// Records are returned in order, including blank ones, so index + 1 is the spreadsheet row number.
// Detects comma, semicolon or tab from the first line.

export function detectDelimiter(text: string) {
  const first = text.slice(0, text.search(/\r?\n|$/));
  const counts = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows; // blank rows kept so positions match spreadsheet row numbers
}

export const isBlankRow = (r: string[]) => r.every((f) => f.trim() === '');

const needsQuotes = /[",\r\n]/;
export const toCsv = (rows: (string | number | null | undefined)[][]) =>
  rows.map((r) => r.map((v) => {
    const s = v == null ? '' : String(v);
    return needsQuotes.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
