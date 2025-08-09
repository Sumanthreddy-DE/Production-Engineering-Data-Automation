import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const LIB_FILE = path.join(DATA_DIR, 'library.json');

app.use(cors());
app.use(express.json({ limit: '5mb' }));

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error('Failed to read JSON', filePath, e);
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write JSON', filePath, e);
    return false;
  }
}

app.get('/api/library', (req, res) => {
  const lib = readJsonSafe(LIB_FILE, { processes: [], buildingBlocks: [], links: [], notes: [] });
  res.json(lib);
});

app.post('/api/library', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid body' });
  const ok = writeJsonSafe(LIB_FILE, body);
  if (!ok) return res.status(500).json({ error: 'Failed to persist' });
  res.json({ ok: true });
});

app.post('/api/dependencies', (req, res) => {
  const { main, subs } = req.body || {};
  if (!main || !Array.isArray(subs)) return res.status(400).json({ error: 'Invalid dependency payload' });
  const lib = readJsonSafe(LIB_FILE, { processes: [], buildingBlocks: [], links: [], notes: [] });

  const processes = lib.processes ?? [];
  const links = lib.links ?? [];

  const ensure = (id, name, type) => {
    const pid = id || `gen:${name.toLowerCase().replace(/\s+/g, '-')}`;
    let p = processes.find((x) => x.id === pid);
    if (!p) {
      p = { id: pid, name, type, merkmalsklassen: [] };
      processes.push(p);
    } else {
      p.name = p.name || name;
      p.type = p.type || type;
    }
    return pid;
  };

  const mainId = ensure(main.id, main.name, 'Hauptprozess');
  const subIds = subs.map((s) => ensure(s.id, s.name, 'Teilprozess'));
  for (const sid of subIds) {
    const key = `${mainId}->${sid}:contains`;
    if (!links.find((e) => `${e.from}->${e.to}:${e.type}` === key)) links.push({ from: mainId, to: sid, type: 'contains' });
  }

  const ok = writeJsonSafe(LIB_FILE, { ...lib, processes, links });
  if (!ok) return res.status(500).json({ error: 'Failed to persist' });
  res.json({ ok: true, mainId, subIds });
});

app.listen(PORT, () => {
  console.log(`DEHN backend listening on http://localhost:${PORT}`);
});

