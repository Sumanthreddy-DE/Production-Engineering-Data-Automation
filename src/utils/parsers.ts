import type { LibraryData, ChartNode, ChartEdge, Process, BuildingBlock } from '@utils/types';
import { translateLabel } from '@utils/i18n';
import * as XLSX from 'xlsx';

export async function parseXlsxToLibrary(file: File): Promise<LibraryData> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const processes: Process[] = [];
  const buildingBlocks: BuildingBlock[] = [];
  const verkn: ChartEdge[] = [];
  const notes: string[] = [];

  // Heuristic: find sheets containing columns like ID/Name/Type
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
    if (!rows.length) continue;
    const headers = Object.keys(rows[0]).map((h) => h.toLowerCase());

    const looksLikeProcess = headers.some((h) => h.includes('process')) || headers.includes('id') || headers.includes('type');
    const looksLikeBlock = headers.some((h) => h.includes('building') || h.includes('block') || h.includes('category'));

    if (looksLikeProcess) {
      for (const r of rows) {
        const id = String(r.id ?? r.ID ?? r['Process ID'] ?? '').trim();
        const nameRaw = String(r.name ?? r.Name ?? r['Process Name'] ?? r['Name deutsch'] ?? '').trim();
        const name = translateLabel(nameRaw);
        const typeRaw = String(r.type ?? r.Type ?? r['Prozessart'] ?? '').trim();
        if (!id || !name) continue;
        const type = /teil|sub/i.test(typeRaw) ? 'Teilprozess' : 'Hauptprozess';
        const merkmalsklassen = parseArrayField(
          r.merkmalsklassen ?? r['Merkmalsklassen'] ?? r['Klasse'] ?? r['class'] ?? ''
        ).map(translateLabel);
        const randbedingungen = parseArrayField(r.randbedingungen ?? r['Randbedingungen'] ?? '');
        const partialStr = parseArrayField(r.partialProcesses ?? r['Teilprozesse'] ?? '');
        const blockStr = parseArrayField(r.buildingBlocks ?? r['Bausteine'] ?? '');
        const ablageort = parseAblage(r);
        processes.push({ id, name, type, merkmalsklassen, randbedingungen, partialProcesses: partialStr, buildingBlocks: blockStr, ablageort });

        // If there are explicit relations columns
        if (partialStr.length) partialStr.forEach((pid) => verkn.push({ from: id, to: pid, type: 'contains' }));
        if (blockStr.length) blockStr.forEach((bid) => verkn.push({ from: id, to: bid, type: 'uses' }));
      }
      continue;
    }

    if (looksLikeBlock) {
      for (const r of rows) {
        const id = String(r.id ?? r.ID ?? '').trim();
        const name = String(r.name ?? r.Name ?? '').trim();
        if (!id || !name) continue;
        const category = translateLabel(String(r.category ?? r.Category ?? r['Bauteilkategorie'] ?? '').trim());
        const hersteller = String(r.hersteller ?? r.Hersteller ?? r.Manufacturer ?? '').trim() || undefined;
        const eigenschaften = collectProperties(r);
        const ablageort = String(r.ablageort ?? r['Ablageort'] ?? '').trim() || undefined;
        buildingBlocks.push({ id, name, category, hersteller, eigenschaften, ablageort });
      }
      continue;
    }

    // Fallback: capture free text as notes
    for (const r of rows) {
      const line = Object.values(r).join(' ').trim();
      if (line) notes.push(line);
    }
  }

  return { processes, buildingBlocks, links: verkn, notes };
}

function parseArrayField(v: any): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  const s = String(v ?? '').trim();
  if (!s) return [];
  return s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseAblage(r: Record<string, any>): Record<string, string | string[]> | string | undefined {
  const keys = Object.keys(r);
  const locKeys = keys.filter((k) => /ablage|storage|konstruktiv|steuerung|test|robot/i.test(k));
  if (!locKeys.length) return undefined;
  const out: Record<string, string | string[]> = {};
  for (const k of locKeys) {
    const val = r[k];
    if (Array.isArray(val)) out[k] = val;
    else out[k] = String(val);
  }
  return out;
}

function collectProperties(r: Record<string, any>): Record<string, string | number> | undefined {
  const obj: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(r)) {
    if (/id|name|category|hersteller|ablage|prozess|process|type/i.test(k)) continue;
    if (v === '' || v == null) continue;
    obj[k] = typeof v === 'number' ? v : String(v);
  }
  return Object.keys(obj).length ? obj : undefined;
}

export async function parsePdfToNotes(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  // @ts-expect-error - worker entry is set at runtime by pdfjs-dist in modern builds
  const getDocument = (pdfjs as any).getDocument ?? (pdfjs as any).default.getDocument;
  const buf = await file.arrayBuffer();
  const loadingTask = getDocument({ data: buf });
  const pdf = await loadingTask.promise;
  const notes: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => it.str).join(' ').replace(/\s+/g, ' ').trim();
    if (text) notes.push(text);
  }
  return notes;
}

export function buildMindMapFromLibrary(lib: LibraryData): { nodes: ChartNode[]; edges: ChartEdge[] } {
  const nodes: ChartNode[] = [];
  const edges: ChartEdge[] = [];

  const root: ChartNode = { id: 'root', name: 'Process and Component Catalogue for Automation', type: 'category' };
  nodes.push(root);

  // Categories
  const processesNode: ChartNode = { id: 'cat:processes', name: 'Processes', type: 'category' };
  const modularNode: ChartNode = { id: 'cat:modular', name: 'Baukasten (Modular System)', type: 'category' };
  const typesNode: ChartNode = { id: 'cat:types', name: 'Process Types', type: 'category' };
  const storageNode: ChartNode = { id: 'cat:storage', name: 'Storage Locations', type: 'category' };
  const notesNode: ChartNode = { id: 'cat:notes', name: 'Notes/Hints', type: 'category' };
  const cats = [processesNode, modularNode, typesNode, storageNode, notesNode];
  nodes.push(...cats);
  cats.forEach((c) => edges.push({ from: root.id, to: c.id, type: 'contains' }));

  // Processes → Main / Sub
  const mainNode: ChartNode = { id: 'cat:main', name: 'Main Processes', type: 'category' };
  const subNode: ChartNode = { id: 'cat:sub', name: 'Sub-Processes', type: 'category' };
  nodes.push(mainNode, subNode);
  edges.push({ from: processesNode.id, to: mainNode.id, type: 'contains' });
  edges.push({ from: processesNode.id, to: subNode.id, type: 'contains' });

  for (const p of lib.processes) {
    const node: ChartNode = { id: `proc:${p.id}`, name: p.name, type: p.type === 'Hauptprozess' ? 'main-process' : 'partial-process' };
    nodes.push(node);
    edges.push({ from: p.type === 'Hauptprozess' ? mainNode.id : subNode.id, to: node.id, type: 'contains' });
    // Tail node like in the screenshot (green nodes with Process ID ...)
    const tail: ChartNode = { id: `tail:${p.id}`, name: `Process ID: ${p.id}`, type: 'category' };
    nodes.push(tail);
    edges.push({ from: node.id, to: tail.id, type: 'contains' });
  }

  // Modular system: list categories of building blocks
  const byCat = new Map<string, BuildingBlock[]>();
  for (const b of lib.buildingBlocks) {
    if (!byCat.has(b.category)) byCat.set(b.category, []);
    byCat.get(b.category)!.push(b);
  }
  for (const [cat, arr] of byCat.entries()) {
    const catNode: ChartNode = { id: `bbcat:${cat}`, name: cat, type: 'category' };
    nodes.push(catNode);
    edges.push({ from: modularNode.id, to: catNode.id, type: 'contains' });
    for (const b of arr) {
      const n: ChartNode = { id: `bb:${b.id}`, name: b.name, type: 'building-block' };
      nodes.push(n);
      edges.push({ from: catNode.id, to: n.id, type: 'contains' });
    }
  }

  // Process Types: aggregate merkmalsklassen
  const classes = new Set<string>();
  lib.processes.forEach((p) => (p.merkmalsklassen ?? []).forEach((m) => classes.add(m)));
  for (const c of classes) {
    const cNode: ChartNode = { id: `type:${c}`, name: c, type: 'category' };
    nodes.push(cNode);
    edges.push({ from: typesNode.id, to: cNode.id, type: 'contains' });
  }

  // Storage Locations: keys from ablageort
  const keys = new Set<string>();
  for (const p of lib.processes) {
    if (p.ablageort && typeof p.ablageort === 'object') for (const k of Object.keys(p.ablageort)) keys.add(k);
  }
  const storageChildren: string[] = Array.from(keys.size ? keys : new Set(['Constructive', 'Control Technology', 'Test Technology', 'Robot Technology']));
  for (const k of storageChildren) {
    const sNode: ChartNode = { id: `stor:${k}`, name: k, type: 'category' };
    nodes.push(sNode);
    edges.push({ from: storageNode.id, to: sNode.id, type: 'contains' });
  }

  // Notes/Hints
  for (const [i, t] of (lib.notes ?? []).entries()) {
    const n: ChartNode = { id: `note:${i}`, name: t.slice(0, 80) + (t.length > 80 ? '…' : ''), type: 'category' };
    nodes.push(n);
    edges.push({ from: notesNode.id, to: n.id, type: 'contains' });
  }

  return { nodes, edges };
}

// --- Lösungsbibliothek (custom JSON) ---

type LoesungsRow = {
  [key: string]: any;
  'Prozessnummer'?: string;
  'Prozessname'?: string;
  'Prozessart'?: string;
  'Merkmalsklasse 1'?: string;
  'Merkmalsklasse 2'?: string;
  'Merkmalsklasse 3'?: string;
  'Randbedingung 1'?: string;
  'Randbedingung 2'?: string;
  'Verknüpfungen Prozessebene'?: string;
  'Ablageort konstruktiv'?: string;
  'Ablageort steuerungstechnisch'?: string;
  'Ablageort prüftechnisch'?: string;
  'Ablageort robotertechnisch'?: string;
};

function parseRangeOrList(text: string): string[] {
  const s = (text || '').trim();
  if (!s) return [];
  // Supports: "100001 - 100006", "100001-100006", "100001,100002", "100001; 100002"
  const range = s.match(/^(\d{3,})\s*[-–]\s*(\d{3,})$/);
  if (range) {
    const start = parseInt(range[1], 10);
    const end = parseInt(range[2], 10);
    const out: string[] = [];
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    for (let i = lo; i <= hi; i++) out.push(String(i).padStart(range[1].length, '0'));
    return out;
  }
  return s
    .split(/[;,\n\s]+/)
    .map((x) => x.trim())
    .filter((x) => /^\d{3,}$/.test(x));
}

export async function parseLoesungsbibliothekJsonFile(file: File): Promise<LibraryData> {
  const text = await file.text();
  let raw: LoesungsRow[] = [];
  try {
    raw = JSON.parse(text);
  } catch {
    return { processes: [], buildingBlocks: [], links: [], notes: [] };
  }

  const processes: Process[] = [];
  const links: ChartEdge[] = [];

  for (const r of raw) {
    const id = String(r['Prozessnummer'] ?? '').trim();
    const name = translateLabel(String(r['Prozessname'] ?? '').trim());
    const typeRaw = String(r['Prozessart'] ?? '').trim();
    if (!id || !name) continue;
    const type: Process['type'] = /teil/i.test(typeRaw) ? 'Teilprozess' : 'Hauptprozess';
    const merkmalsklassen = [r['Merkmalsklasse 1'], r['Merkmalsklasse 2'], r['Merkmalsklasse 3']]
      .map((x) => String(x ?? '').trim())
      .filter((x) => x && x !== '-')
      .map(translateLabel);
    const randbedingungen = [r['Randbedingung 1'], r['Randbedingung 2']]
      .map((x) => String(x ?? '').trim())
      .filter(Boolean);
    const ablageort: Record<string, string> = {};
    if (r['Ablageort konstruktiv']) ablageort['constructive'] = String(r['Ablageort konstruktiv']);
    if (r['Ablageort steuerungstechnisch']) ablageort['control'] = String(r['Ablageort steuerungstechnisch']);
    if (r['Ablageort prüftechnisch']) ablageort['test'] = String(r['Ablageort prüftechnisch']);
    if (r['Ablageort robotertechnisch']) ablageort['robot'] = String(r['Ablageort robotertechnisch']);

    processes.push({ id, name, type, merkmalsklassen, randbedingungen, ablageort });

    const deps = parseRangeOrList(String(r['Verknüpfungen Prozessebene'] ?? ''));
    for (const other of deps) {
      // If this row is Hauptprozess and lists a range → contains
      // If this row is Teilprozess and lists a parent → also contains (parent -> this)
      if (type === 'Hauptprozess') {
        links.push({ from: id, to: other, type: 'contains' });
      } else {
        links.push({ from: other, to: id, type: 'contains' });
      }
    }
  }

  // Deduplicate edges
  const seen = new Set<string>();
  const dedupLinks = links.filter((e) => {
    const k = `${e.from}->${e.to}:${e.type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { processes, buildingBlocks: [], links: dedupLinks, notes: [] };
}

