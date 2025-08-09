import { LibraryData, Process } from './types';
import { toCanonicalKeyword, translateLabel } from './i18n';

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFKD');
}

export function suggestProcesses(
  problem: string,
  merkmalsklassen: string[],
  library: LibraryData
): Process[] {
  const p = normalize(problem);
  const mk = new Set(merkmalsklassen.map((m) => toCanonicalKeyword(m)));

  const scored: Array<{ proc: Process; score: number }> = [];

  for (const proc of library.processes) {
    let score = 0;
    const translatedName = translateLabel(proc.name);
    const title = normalize(translatedName + ' ' + proc.id);
    if (p && title.includes(p)) score += 3;
    if (proc.merkmalsklassen) {
      for (const m of proc.merkmalsklassen) {
        if (mk.has(toCanonicalKeyword(m))) score += 4; // prioritize class match
      }
    }
    // Small boost for Hauptprozess in top-level search
    if (proc.type === 'Hauptprozess') score += 1;
    if (score > 0) scored.push({ proc, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map((s) => s.proc);
}

