import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BuildingBlock, ChartEdge, ChartNode, LibraryData, Process } from '@utils/types';
import { suggestProcesses } from '@utils/assistant';
import { apiGetLibrary, apiSaveLibrary, apiPostDependencies } from '@utils/api';

type State = {
  library?: LibraryData;
  nodes: ChartNode[];
  edges: ChartEdge[];
  selectedNodeId?: string;
  searchQuery: string;
  viewMode: 'flowchart' | 'mindmap';
};

type Actions = {
  loadLibrary: (lib: LibraryData) => void;
  reset: () => void;
  setSearchQuery: (q: string) => void;
  selectNode: (id?: string) => void;
  setProblem: (problem: string, merkmalsklassen: string[]) => void;
  expandNode: (id: string) => void;
  toggleNode: (id: string) => void;
  automate: () => void;
  setViewMode: (mode: 'flowchart' | 'mindmap') => void;
  importFiles: (files: File[]) => Promise<void>;
  importDependencies: (text: string) => void;
  loadFromBackend: () => Promise<void>;
  saveToBackend: () => Promise<void>;
  searchAndStartProcess: (query: string) => void;
  startFromProcess: (processId: string) => void;
};

function toChartNodeFromProcess(p: Process): ChartNode {
  return {
    id: p.id,
    name: p.name,
    type: p.type === 'Hauptprozess' ? 'main-process' : 'partial-process',
    merkmalsklassen: p.merkmalsklassen,
    randbedingungen: p.randbedingungen,
    ablageort: p.ablageort,
  };
}

function toChartNodeFromBlock(b: BuildingBlock): ChartNode {
  return {
    id: b.id,
    name: b.name,
    type: 'building-block',
    eigenschaften: b.eigenschaften,
    ablageort: b.ablageort,
  };
}

export const useFlowchartStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      library: undefined,
      nodes: [],
      edges: [],
      selectedNodeId: undefined,
      searchQuery: '',
      viewMode: 'flowchart',

      loadLibrary: (lib) => set({ library: lib }),

      loadFromBackend: async () => {
        const lib = await apiGetLibrary();
        if (lib) set({ library: lib });
      },
      saveToBackend: async () => {
        const lib = get().library;
        if (!lib) return;
        await apiSaveLibrary(lib);
      },

      reset: () => set({ nodes: [], edges: [], selectedNodeId: undefined }),

      setSearchQuery: (q) => set({ searchQuery: q }),

      selectNode: (id) => set({ selectedNodeId: id }),

      setProblem: (problem, merkmalsklassen) => {
        const lib = get().library;
        if (!lib) return;
        const probNode: ChartNode = { id: `problem:${problem}`, name: problem, type: 'problem' };
        const suggestions = suggestProcesses(problem, merkmalsklassen, lib);
        const procNodes = suggestions.map(toChartNodeFromProcess);
        const edges: ChartEdge[] = suggestions.map((p) => ({ from: probNode.id, to: p.id, type: 'solved-by' }));
        set({ nodes: [probNode, ...procNodes], edges, selectedNodeId: probNode.id });
      },

      expandNode: (id) => {
        const { library, nodes, edges } = get();
        if (!library) return;
        const node = nodes.find((n) => n.id === id);
        if (!node) return;

        const byId = new Map(nodes.map((n) => [n.id, n] as const));
        const edgeSet = new Set(edges.map((e) => `${e.from}->${e.to}:${e.type}`));

        const newNodes: ChartNode[] = [];
        const newEdges: ChartEdge[] = [];

        // First check library links for relationships
        const outgoingLinks = library.links?.filter((link) => link.from === id) || [];
        
        for (const link of outgoingLinks) {
          const target = library.processes.find((p) => p.id === link.to) || library.buildingBlocks.find((b) => b.id === link.to);
          if (!target) continue;
          
          let cn: ChartNode;
          if ('merkmalsklassen' in target) {
            cn = toChartNodeFromProcess(target as Process);
          } else {
            cn = toChartNodeFromBlock(target as BuildingBlock);
          }
          
          if (!byId.has(cn.id)) newNodes.push(cn);
          const e: ChartEdge = { from: id, to: link.to, type: link.type };
          const key = `${e.from}->${e.to}:${e.type}`;
          if (!edgeSet.has(key)) newEdges.push(e);
        }
        
        // Fallback to old structure if no links found
        if (outgoingLinks.length === 0) {
          if (node.type === 'main-process') {
            const proc = library.processes.find((p) => p.id === id);
            if (proc?.partialProcesses) {
              for (const pid of proc.partialProcesses) {
                const child = library.processes.find((p) => p.id === pid);
                if (!child) continue;
                const cn = toChartNodeFromProcess(child);
                if (!byId.has(cn.id)) newNodes.push(cn);
                const e: ChartEdge = { from: id, to: child.id, type: 'contains' };
                const key = `${e.from}->${e.to}:${e.type}`;
                if (!edgeSet.has(key)) newEdges.push(e);
              }
            }
          } else if (node.type === 'partial-process') {
            const proc = library.processes.find((p) => p.id === id);
            if (proc?.buildingBlocks) {
              for (const bid of proc.buildingBlocks) {
                const block = library.buildingBlocks.find((b) => b.id === bid);
                if (!block) continue;
                const cn = toChartNodeFromBlock(block);
                if (!byId.has(cn.id)) newNodes.push(cn);
                const e: ChartEdge = { from: id, to: block.id, type: 'uses' };
                const key = `${e.from}->${e.to}:${e.type}`;
                if (!edgeSet.has(key)) newEdges.push(e);
              }
            }
          }
        }

        if (newNodes.length || newEdges.length) {
          set({ nodes: [...nodes, ...newNodes], edges: [...edges, ...newEdges] });
        }
      },

      // Expand if collapsed; otherwise collapse by removing all descendants from the clicked node
      toggleNode: (id) => {
        const { edges, nodes } = get();
        const hasOutgoing = edges.some((e) => e.from === id);
        if (!hasOutgoing) {
          get().expandNode(id);
          return;
        }

        // Build descendant set (exclude the root id)
        const childrenByFrom = new Map<string, string[]>();
        for (const e of edges) {
          if (!childrenByFrom.has(e.from)) childrenByFrom.set(e.from, []);
          childrenByFrom.get(e.from)!.push(e.to);
        }
        const toRemove = new Set<string>();
        const queue: string[] = [];
        // start with direct children
        (childrenByFrom.get(id) ?? []).forEach((c) => queue.push(c));
        while (queue.length) {
          const cur = queue.shift()!;
          if (toRemove.has(cur)) continue;
          toRemove.add(cur);
          const nexts = childrenByFrom.get(cur) ?? [];
          nexts.forEach((n) => queue.push(n));
        }

        if (!toRemove.size) return;
        const newNodes = nodes.filter((n) => !toRemove.has(n.id));
        const newEdges = edges.filter((e) => e.from !== id && !toRemove.has(e.from) && !toRemove.has(e.to));
        set({ nodes: newNodes, edges: newEdges });
      },

      automate: () => {
        const { nodes, library } = get();
        if (!library) return;
        const root = nodes.find((n) => n.type === 'problem');
        if (!root) return;
        // Try a default set of classes from the library (English)
        const frequentClasses = ['Applying', 'Printing', 'Preparing'];
        const suggestions = suggestProcesses(root.name, frequentClasses, library).map(toChartNodeFromProcess);
        const existingIds = new Set(nodes.map((n) => n.id));
        const newNodes = suggestions.filter((n) => !existingIds.has(n.id));
        const newEdges: ChartEdge[] = newNodes.map((n) => ({ from: root.id, to: n.id, type: 'solved-by' }));
        if (newNodes.length || newEdges.length) {
          set({ nodes: [...nodes, ...newNodes], edges: [...get().edges, ...newEdges] });
        }
      },

      setViewMode: (mode) => set({ viewMode: mode }),

      importFiles: async (files: File[]) => {
        const { library } = get();
        let lib: LibraryData = library ?? { processes: [], buildingBlocks: [], links: [], notes: [] };
        const { parseXlsxToLibrary, parsePdfToNotes } = await import('@utils/parsers');

        for (const f of files) {
          const lower = f.name.toLowerCase();
          try {
            if (lower.endsWith('.xlsx')) {
              const xl = await parseXlsxToLibrary(f);
              lib = {
                processes: mergeById(lib.processes, xl.processes, (x) => x.id),
                buildingBlocks: mergeById(lib.buildingBlocks, xl.buildingBlocks, (x) => x.id),
                links: mergeEdges(lib.links, xl.links),
                notes: [...(lib.notes ?? []), ...(xl.notes ?? [])],
              };
            } else if (lower.endsWith('.pdf')) {
              const notes = await parsePdfToNotes(f);
              lib = { ...lib, notes: [...(lib.notes ?? []), ...notes] };
            }
          } catch (err) {
            console.error('Failed to parse file:', f.name, err);
          }
        }

        set({ library: lib });
        // Build a mindmap view by default upon import
        const { buildMindMapFromLibrary } = await import('@utils/parsers');
        const { nodes, edges } = buildMindMapFromLibrary(lib);
        set({ nodes, edges, viewMode: 'mindmap', selectedNodeId: nodes[0]?.id });
      },

      importDependencies: (text: string) => {
        const { parseDependencyTable } = require('@utils/dependencyParser');
        const table = parseDependencyTable(text);
        if (!table) return;

        const { library = { processes: [], buildingBlocks: [], links: [], notes: [] } } = get();
        const processes = [...library.processes];
        const links = [...(library.links ?? [])];

        const ensureProcess = (id: string | undefined, name: string, type: 'Hauptprozess' | 'Teilprozess') => {
          const pid = id ?? `gen:${name.toLowerCase().replace(/\s+/g, '-')}`;
          let p = processes.find((x) => x.id === pid);
          if (!p) {
            p = { id: pid, name, type, merkmalsklassen: [] };
            processes.push(p);
          } else {
            // ensure name/type are set
            p.name = p.name || name;
            p.type = p.type || type;
          }
          return p.id;
        };

        const mainId = ensureProcess(table.main.id, table.main.name, 'Hauptprozess');
        const subIds = table.subs.map((s) => ensureProcess(s.id, s.name, 'Teilprozess'));

        for (const sid of subIds) {
          const key = `${mainId}->${sid}:contains`;
          if (!links.find((e) => `${e.from}->${e.to}:${e.type}` === key)) {
            links.push({ from: mainId, to: sid, type: 'contains' });
          }
        }

        const newLib = { ...library, processes, links };
        set({ library: newLib });
        void apiPostDependencies({
          main: { id: table.main.id, name: table.main.name },
          subs: table.subs.map((s) => ({ id: s.id, name: s.name })),
        });

        // Update current view nodes/edges in flowchart mode for clarity
        const mainNode = toChartNodeFromProcess(processes.find((p) => p.id === mainId)!);
        const subNodes = subIds.map((id) => toChartNodeFromProcess(processes.find((p) => p.id === id)!));
        const edges: ChartEdge[] = subIds.map((id) => ({ from: mainId, to: id, type: 'contains' }));
        set({ nodes: [mainNode, ...subNodes], edges, viewMode: 'flowchart', selectedNodeId: mainNode.id });
      },

      searchAndStartProcess: (query: string) => {
        const { library } = get();
        if (!library || !query.trim()) return;
        
        // First check if we have the specific main process 100000
        const mainProcess = library.processes.find(p => p.id === '100000' && p.type === 'Hauptprozess');
        if (mainProcess) {
          get().startFromProcess(mainProcess.id);
          return;
        }
        
        // Search for processes matching the query
        const lowerQuery = query.toLowerCase();
        const matchingProcesses = library.processes.filter(
          (p) =>
            p.name.toLowerCase().includes(lowerQuery) ||
            p.id.toLowerCase().includes(lowerQuery) ||
            (p.merkmalsklassen && p.merkmalsklassen.some((m) => m.toLowerCase().includes(lowerQuery)))
        );

        if (matchingProcesses.length === 0) {
          // No direct matches, try to use as a problem description
          get().setProblem(query, ['Applying', 'Printing', 'Preparing']);
          return;
        }

        // Prefer Hauptprozess if available, otherwise take the first match
        const hauptprozess = matchingProcesses.find(p => p.type === 'Hauptprozess');
        const bestMatch = hauptprozess || matchingProcesses[0];
        get().startFromProcess(bestMatch.id);
      },

      startFromProcess: (processId: string) => {
        const { library } = get();
        if (!library) return;
        
        const process = library.processes.find((p) => p.id === processId);
        if (!process) return;

        const startNode = toChartNodeFromProcess(process);
        set({ 
          nodes: [startNode], 
          edges: [], 
          selectedNodeId: startNode.id,
          viewMode: 'flowchart'
        });

        // Auto-expand the process to show its sub-processes or components
        get().expandNode(processId);
      },
    }),
    { name: 'dehn-flowchart-store' }
  )
);

function mergeById<T>(a: T[], b: T[], getId: (t: T) => string): T[] {
  const map = new Map(a.map((x) => [getId(x), x] as const));
  for (const item of b) map.set(getId(item), item);
  return Array.from(map.values());
}

function mergeEdges(a: ChartEdge[], b: ChartEdge[]): ChartEdge[] {
  const key = (e: ChartEdge) => `${e.from}->${e.to}:${e.type}`;
  const set = new Map(a.map((e) => [key(e), e] as const));
  for (const e of b) set.set(key(e), e);
  return Array.from(set.values());
}

