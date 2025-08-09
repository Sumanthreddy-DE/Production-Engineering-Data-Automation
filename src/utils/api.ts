import type { DependencyPayload, LibraryData } from '@utils/types';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export async function apiGetLibrary(): Promise<LibraryData | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/library`);
    if (!res.ok) return null;
    return (await res.json()) as LibraryData;
  } catch {
    return null;
  }
}

export async function apiSaveLibrary(lib: LibraryData): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lib),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function apiPostDependencies(payload: DependencyPayload): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

