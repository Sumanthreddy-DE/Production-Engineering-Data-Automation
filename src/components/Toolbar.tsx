import React, { useMemo, useState } from 'react';
import { useFlowchartStore } from '@store/useFlowchartStore';

const ALL_MERKMALSKLASSEN = [
  'Applying',
  'Printing',
  'Preparing',
  'Manipulating',
  'Positioning',
  'Robot',
  'Camera',
];

const Toolbar: React.FC = () => {
  const setProblem = useFlowchartStore((s) => s.setProblem);
  const query = useFlowchartStore((s) => s.searchQuery);
  const setSearchQuery = useFlowchartStore((s) => s.setSearchQuery);
  const searchAndStartProcess = useFlowchartStore((s) => s.searchAndStartProcess);
  const automate = useFlowchartStore((s) => s.automate);
  const reset = useFlowchartStore((s) => s.reset);
  const viewMode = useFlowchartStore((s) => s.viewMode);
  const setViewMode = useFlowchartStore((s) => s.setViewMode);
  const importFiles = useFlowchartStore((s) => s.importFiles);
  const importDependencies = useFlowchartStore((s) => s.importDependencies);

  const [queryInput, setQueryInput] = useState('');
  const [selectedMerkmalsklassen, setSelectedMerkmalsklassen] = useState<string[]>(['Applying']);

  const options = useMemo(() => ALL_MERKMALSKLASSEN, []);

  const onQuerySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (queryInput.trim()) {
      searchAndStartProcess(queryInput.trim());
    }
  };

  const onAutomate = () => {
    automate();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    // If user selects a custom Lösungsbibliothek JSON, parse it first for precise dependencies
    const { parseLoesungsbibliothekJsonFile } = await import('@utils/parsers');
    const loesungs = files.filter((f) => /lösungsbibliothek|loesungsbibliothek/i.test(f.name));
    if (loesungs.length) {
      const lib = await parseLoesungsbibliothekJsonFile(loesungs[0]);
      // Load into store directly
      const loadLibrary = useFlowchartStore.getState().loadLibrary;
      loadLibrary(lib);
      // Switch to mindmap centered on processes
      const { buildMindMapFromLibrary } = await import('@utils/parsers');
      const { nodes, edges } = buildMindMapFromLibrary(lib);
      useFlowchartStore.setState({ nodes, edges, viewMode: 'mindmap', selectedNodeId: nodes[0]?.id });
      return;
    }
    await importFiles(files);
  };

  const onPasteDependencies = () => {
    const text = window.prompt(
      'Paste dependency table (first line main process, following lines sub processes). Example:\nEtikett applizieren [100000]\nEtikett drucken und bereitstellen [100001]\nEtikett aufnehmen und manipulieren [100002]'
    );
    if (text) importDependencies(text);
  };

  return (
    <div className="toolbar" role="region" aria-label="Toolbar">
      <form className="query-form" onSubmit={onQuerySubmit}>
        <input
          className="text-input main-query"
          type="text"
          placeholder="Enter your query (process name, problem description, or keyword)"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          aria-label="Query"
        />
        <button className="btn primary" type="submit">
          Start Process
        </button>
        <button className="btn" type="button" onClick={reset}>
          Reset View
        </button>
      </form>
      <div className="search-box">
        <input
          className="text-input"
          type="text"
          placeholder="Search by name, ID, class"
          value={query}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search"
        />
      </div>
      <div className="right-controls">
        <label className="toggle">
          <span>Layout:</span>
          <select
            className="text-input"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as 'flowchart' | 'mindmap')}
            aria-label="Layout"
          >
            <option value="flowchart">Flowchart</option>
            <option value="mindmap">Mind Map</option>
          </select>
        </label>
        <label className="btn">
          Import XLSX/PDF
          <input type="file" accept=".xlsx,.pdf,.json" multiple style={{ display: 'none' }} onChange={onFileChange} />
        </label>
        <button className="btn" type="button" onClick={onPasteDependencies}>Add Dependencies</button>
      </div>
    </div>
  );
};

export default Toolbar;

