import React, { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { useFlowchartStore } from '@store/useFlowchartStore';
import { ChartNode, ChartEdge } from '@utils/types';

const LAYER_WIDTH = 220;
const NODE_WIDTH = 180;
const NODE_HEIGHT = 48;

function computeDepths(nodes: ChartNode[], edges: ChartEdge[]): Map<string, number> {
  const depth = new Map<string, number>();
  
  // Find the main process (should be at depth 0 - center)
  const mainProcess = nodes.find(n => n.type === 'main-process');
  if (mainProcess) {
    depth.set(mainProcess.id, 0);
  }
  
  // Initialize problem nodes at depth 0 if no main process
  if (!mainProcess) {
    nodes.forEach((n) => {
      if (n.type === 'problem') depth.set(n.id, 0);
    });
  }

  let changed = true;
  let guard = 0;
  while (changed && guard < 1000) {
    changed = false;
    guard += 1;
    for (const e of edges) {
      const fromDepth = depth.get(e.from);
      if (fromDepth !== undefined) {
        const toDepth = depth.get(e.to) ?? -1;
        const next = Math.max(toDepth, fromDepth + 1);
        if (next !== toDepth) {
          depth.set(e.to, next);
          changed = true;
        }
      }
    }
  }
  
  // Set default depths: main-process=0, partial-process=1, building-block=2
  nodes.forEach((n) => {
    if (!depth.has(n.id)) {
      if (n.type === 'main-process') depth.set(n.id, 0);
      else if (n.type === 'partial-process') depth.set(n.id, 1);
      else if (n.type === 'building-block') depth.set(n.id, 2);
      else depth.set(n.id, 0);
    }
  });
  return depth;
}

const FlowchartCanvas: React.FC = () => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodes = useFlowchartStore((s) => s.nodes);
  const edges = useFlowchartStore((s) => s.edges);
  const selectNode = useFlowchartStore((s) => s.selectNode);
  const toggleNode = useFlowchartStore((s) => s.toggleNode);

  const layout = useMemo(() => {
    const depth = computeDepths(nodes, edges);
    const depthToNodes = new Map<number, ChartNode[]>();
    for (const n of nodes) {
      const d = depth.get(n.id) ?? 0;
      if (!depthToNodes.has(d)) depthToNodes.set(d, []);
      depthToNodes.get(d)!.push(n);
    }
    
    const positioned = new Map<string, { x: number; y: number }>();
    let maxDepth = Math.max(...Array.from(depthToNodes.keys()), 0);
    let minDepth = Math.min(...Array.from(depthToNodes.keys()), 0);
    
    const containerHeight = containerRef.current?.clientHeight ?? 800;
    const containerWidth = containerRef.current?.clientWidth ?? 1200;
    
    // Calculate total width needed
    const totalLayers = maxDepth - minDepth + 1;
    const totalWidth = Math.max(containerWidth, totalLayers * LAYER_WIDTH + 200);
    
    // Center the layout horizontally
    const startX = (totalWidth - (totalLayers * LAYER_WIDTH)) / 2;
    
    for (const [d, group] of depthToNodes.entries()) {
      const usableHeight = Math.max(200, containerHeight - 40);
      const stepY = group.length > 1 ? usableHeight / (group.length + 1) : usableHeight / 2;
      
      group.forEach((n, i) => {
        // Position layers from left to right, with main process (depth 0) in center
        const layerIndex = d - minDepth;
        const x = startX + layerIndex * LAYER_WIDTH;
        
        // Center vertically within the container
        let y;
        if (group.length === 1) {
          y = containerHeight / 2; // Center single nodes
        } else {
          y = 40 + stepY * (i + 1); // Distribute multiple nodes
        }
        
        positioned.set(n.id, { x, y });
      });
    }
    
    return { positioned, width: totalWidth, height: containerHeight };
  }, [nodes, edges]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const svg = d3.select(el);

    // Reset
    svg.selectAll('*').remove();

    const width = Math.max(layout.width, 800);
    const height = Math.max(layout.height, 600);

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('class', 'viewport');

    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 2])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        })
    );

    // Draw edges (left-to-right, orthogonal elbow)
    const edgeGroup = g.append('g').attr('class', 'edges');
    edges.forEach((e) => {
      const from = layout.positioned.get(e.from);
      const to = layout.positioned.get(e.to);
      if (!from || !to) return;
      const x1 = from.x + NODE_WIDTH / 2;
      const y1 = from.y;
      const x2 = to.x - NODE_WIDTH / 2;
      const y2 = to.y;
      const mx = (x1 + x2) / 2;
      const d = `M${x1},${y1} L${mx},${y1} L${mx},${y2} L${x2},${y2}`;
      edgeGroup
        .append('path')
        .attr('d', d)
        .attr('class', `edge edge-${e.type}`)
        .attr('marker-end', 'url(#arrow)')
        .append('title')
        .text(e.type);
    });

    // Arrow marker
    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 10)
      .attr('refY', 5)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', '#666');

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');
    nodes.forEach((n) => {
      const pos = layout.positioned.get(n.id);
      if (!pos) return;
      const node = nodeGroup.append('g').attr('class', `node node-${n.type}`).attr('transform', `translate(${pos.x},${pos.y})`);

      // Shape per node type
      if (n.type === 'problem') {
        // Diamond
        const size = 34;
        node
          .append('path')
          .attr('d', `M 0 ${-size} L ${size} 0 L 0 ${size} L ${-size} 0 Z`)
          .attr('class', 'node-shape');
      } else if (n.type === 'building-block') {
        node.append('circle').attr('r', 28).attr('class', 'node-shape');
      } else {
        node
          .append('rect')
          .attr('x', -NODE_WIDTH / 2)
          .attr('y', -NODE_HEIGHT / 2)
          .attr('width', NODE_WIDTH)
          .attr('height', NODE_HEIGHT)
          .attr('rx', 8)
          .attr('ry', 8)
          .attr('class', 'node-shape');
      }

      node
        .append('text')
        .attr('class', 'node-label')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .text(() => {
          const label = n.id ? `${n.name} [${n.id}]` : n.name;
          return label.length > 28 ? label.slice(0, 27) + '…' : label;
        })
        .append('title')
        .text(n.name + (n.id ? ` [${n.id}]` : ''));

      node.on('click', () => {
        selectNode(n.id);
        toggleNode(n.id);
      });
    });
  }, [nodes, edges, layout, selectNode, toggleNode]);

  return (
    <div className="flowchart-canvas" ref={containerRef}>
      <svg ref={svgRef} role="img" aria-label="Flowchart Canvas" />
    </div>
  );
};

export default FlowchartCanvas;

