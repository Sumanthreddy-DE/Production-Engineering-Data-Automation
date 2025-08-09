export type ParsedRow = { id?: string; name: string };

export type DependencyTable = {
  main: ParsedRow; // main process (first row)
  subs: ParsedRow[]; // sub processes (rest)
};

function parseCell(cell: string): ParsedRow {
  const raw = cell.trim();
  // Forms supported: "12345, Name", "Name [12345]", "12345\tName", "Name"
  const bracketMatch = raw.match(/^(.*)\[(.+)\]$/);
  if (bracketMatch) {
    const name = bracketMatch[1].trim().replace(/[-:\s]+$/, '').trim();
    const id = bracketMatch[2].trim();
    return { id, name };
  }
  const csv = raw.split(/\s*[;,\t]\s*/);
  if (csv.length >= 2) {
    // Heuristic: if the first token is digits, treat as id
    if (/^\d{3,}$/.test(csv[0])) return { id: csv[0], name: csv.slice(1).join(' ') };
    if (/^\d{3,}$/.test(csv[csv.length - 1])) return { id: csv[csv.length - 1], name: csv.slice(0, -1).join(' ') };
    return { name: raw };
  }
  // Single token; if looks like id only, keep id without name
  if (/^\d{3,}$/.test(raw)) return { id: raw, name: raw };
  return { name: raw };
}

export function parseDependencyTable(text: string): DependencyTable | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^#/.test(l));
  if (!lines.length) return null;
  const main = parseCell(lines[0]);
  const subs = lines.slice(1).map(parseCell).filter((r) => r.name);
  return { main, subs };
}

