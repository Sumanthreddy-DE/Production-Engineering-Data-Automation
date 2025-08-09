import React, { useEffect, useState } from 'react';
import FlowchartCanvas from '@components/FlowchartCanvas';
import MindMapCanvas from '@components/MindMapCanvas';
import Toolbar from '@components/Toolbar';
import NodeDetailsPanel from '@components/NodeDetailsPanel';
import { useFlowchartStore } from '@store/useFlowchartStore';
import libraryData from '@data/library.json';

const QueryPage: React.FC<{ onStartWorkflow: (query: string) => void }> = ({ onStartWorkflow }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onStartWorkflow(query.trim());
    }
  };

  return (
    <div className="query-page">
      <div className="query-container">
        <h1>DEHN Process Flowchart</h1>
        <p>What would you like to work on today?</p>
        <form onSubmit={handleSubmit} className="query-form-main">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter your query (e.g., 'label', 'component decoration', etc.)"
            className="query-input-main"
            autoFocus
          />
          <button type="submit" className="btn primary query-btn">
            Start Workflow
          </button>
        </form>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [showWorkflow, setShowWorkflow] = useState(false);
  const loadLibrary = useFlowchartStore((s) => s.loadLibrary);
  const searchAndStartProcess = useFlowchartStore((s) => s.searchAndStartProcess);
  const reset = useFlowchartStore((s) => s.reset);

  useEffect(() => {
    loadLibrary(libraryData);
  }, [loadLibrary]);

  const viewMode = useFlowchartStore((s) => s.viewMode);

  const handleStartWorkflow = (query: string) => {
    searchAndStartProcess(query);
    setShowWorkflow(true);
  };

  const handleBackToQuery = () => {
    reset();
    setShowWorkflow(false);
  };

  if (!showWorkflow) {
    return <QueryPage onStartWorkflow={handleStartWorkflow} />;
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <button className="btn back-btn" onClick={handleBackToQuery}>
          ← Back to Query
        </button>
        <h1>DEHN Flowchart – Process Workflow</h1>
        <p style={{margin: '4px 0 0 0', fontSize: '14px', color: '#6b7a99'}}>
          Click on processes to expand and see their sub-processes and components.
        </p>
      </header>
      <div className="app-body">
        <Toolbar />
        <div className="content">
          {viewMode === 'mindmap' ? <MindMapCanvas /> : <FlowchartCanvas />}
          <NodeDetailsPanel />
        </div>
      </div>
    </div>
  );
};

export default App;

