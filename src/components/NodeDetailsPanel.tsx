import React, { useMemo } from 'react';
import { useFlowchartStore } from '@store/useFlowchartStore';

const NodeDetailsPanel: React.FC = () => {
  const selectedNodeId = useFlowchartStore((s) => s.selectedNodeId);
  const nodes = useFlowchartStore((s) => s.nodes);

  const node = useMemo(() => nodes.find((n) => n.id === selectedNodeId), [nodes, selectedNodeId]);

  if (!node) return (
    <aside className="side-panel" aria-label="Details">
      <h3>Details</h3>
      <p>Select a node to view details.</p>
    </aside>
  );

  return (
    <aside className="side-panel" aria-label="Details">
      <h3>
        {node.name} {node.id ? `[${node.id}]` : ''}
      </h3>
      <div className="details-grid">
        <div>
          <div className="detail-label">Type</div>
          <div>{node.type}</div>
        </div>
        {Array.isArray(node.merkmalsklassen) && node.merkmalsklassen.length > 0 && (
          <div>
          <div className="detail-label">Classes</div>
            <div>{node.merkmalsklassen.join(', ')}</div>
          </div>
        )}
        {node.randbedingungen && node.randbedingungen.length > 0 && (
          <div>
            <div className="detail-label">Constraints</div>
            <div>{node.randbedingungen.join(', ')}</div>
          </div>
        )}
        {node.ablageort && (
          <div>
            <div className="detail-label">Storage Location</div>
            <div>
              {typeof node.ablageort === 'string'
                ? node.ablageort
                : Object.entries(node.ablageort)
                    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                    .join(' | ')}
            </div>
          </div>
        )}
        {node.eigenschaften && (
          <div>
            <div className="detail-label">Properties</div>
            <div>
              {Object.entries(node.eigenschaften)
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(' | ')}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default NodeDetailsPanel;

