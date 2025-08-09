export type NodeType =
  | 'problem'
  | 'main-process'
  | 'partial-process'
  | 'building-block'
  | 'output'
  | 'category';

export interface Process {
  id: string;
  name: string;
  type: 'Hauptprozess' | 'Teilprozess';
  merkmalsklassen?: string[];
  randbedingungen?: string[];
  partialProcesses?: string[]; // for Hauptprozess
  buildingBlocks?: string[]; // for Teilprozess
  ablageort?: Record<string, string | string[]> | string;
}

export interface BuildingBlock {
  id: string;
  name: string;
  category: string;
  hersteller?: string;
  eigenschaften?: Record<string, string | number>;
  ablageort?: string;
}

export interface LibraryData {
  processes: Process[];
  buildingBlocks: BuildingBlock[];
  links: ChartEdge[];
  notes?: string[];
}

export interface DependencyPayload {
  main: { id?: string; name: string };
  subs: Array<{ id?: string; name: string }>;
}

export interface ChartNode {
  id: string;
  name: string;
  type: NodeType;
  // Optional metadata for display
  merkmalsklassen?: string[];
  randbedingungen?: string[];
  ablageort?: Record<string, string | string[]> | string;
  eigenschaften?: Record<string, string | number>;
}

export interface ChartEdge {
  from: string;
  to: string;
  type: 'contains' | 'uses' | 'solved-by';
}

