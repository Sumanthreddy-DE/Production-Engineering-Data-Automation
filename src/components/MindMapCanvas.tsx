import React, { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { useFlowchartStore } from '@store/useFlowchartStore';

type Point = { x: number; y: number };

function polarToCartesian(cx: number, cy: number, r: number, angle: number): Point {
  return { x: cx + r * Math.cos(angle), y: cy * 1 + r * Math.sin(angle) };
}

const MindMapCanvas: React.FC = () => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodes = useFlowchartStore((s) => s.nodes);
  const edges = useFlowchartStore((s) => s.edges);
  const selectNode = useFlowchartStore((s) => s.selectNode);
  const toggleNode = useFlowchartStore((s) => s.toggleNode);

  const { layout, width, height } = useMemo(() => {
    const width = containerRef.current?.clientWidth ?? 1200;
    const height = containerRef.current?.clientHeight ?? 800;
    const cx = width / 2;
    const cy = height / 2;

    // Group nodes by graph distance from the first node (assume center is first)
    const idToIndex = new Map(nodes.map((n, i) => [n.id, i] as const));
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from)!.push(e.to);
    }

    const start = nodes[0]?.id;
    const levels = new Map<string, number>();
    if (start) {
      const queue = [start];
      levels.set(start, 0);
      while (queue.length) {
        const cur = queue.shift()!;
        const nexts = adj.get(cur) ?? [];
        for (const n of nexts) {
          if (!levels.has(n)) {
            levels.set(n, (levels.get(cur) ?? 0) + 1);
            queue.push(n);
          }
        }
      }
    }

    const depthToNodes = new Map<number, string[]>();
    for (const n of nodes) {
      const d = levels.get(n.id) ?? 1;
      if (!depthToNodes.has(d)) depthToNodes.set(d, []);
      depthToNodes.get(d)!.push(n.id);
    }

    const positioned = new Map<string, Point>();
    const maxDepth = Math.max(0, ...Array.from(depthToNodes.keys()));
    const radiusStep = Math.min(cx, cy) / (maxDepth + 2);

    // Center node
    if (start) positioned.set(start, { x: cx, y: cy });

    for (const [d, ids] of depthToNodes.entries()) {
      if (d === 0) continue;
      const angleStep = (Math.PI * 2) / ids.length;
      ids.forEach((id, i) => {
        const angle = i * angleStep - Math.PI / 2; // start at top
        const r = (d + 0.5) * radiusStep;
        positioned.set(id, polarToCartesian(cx, cy, r, angle));
      });
    }

    return { layout: positioned, width, height };
  }, [nodes, edges]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const svg = d3.select(el);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    const g = svg.append('g').attr('class', 'viewport');
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 2])
        .on('zoom', (event) => g.attr('transform', event.transform))
    );

    // Curved edges
    const edgeGroup = g.append('g').attr('class', 'edges');
    edges.forEach((e) => {
      const p1 = layout.get(e.from);
      const p2 = layout.get(e.to);
      if (!p1 || !p2) return;
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const norm = Math.hypot(dx, dy) || 1;
      const nx = -dy / norm;
      const ny = dx / norm;
      const c1x = mx + nx * 30;
      const c1y = my + ny * 30;
      edgeGroup
        .append('path')
        .attr('d', `M${p1.x},${p1.y} Q${c1x},${c1y} ${p2.x},${p2.y}`)
        .attr('class', `edge edge-${e.type}`)
        .attr('marker-end', 'url(#arrow)');
    });

    // Arrow
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

    // Nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');
    nodes.forEach((n) => {
      const p = layout.get(n.id);
      if (!p) return;
      const node = nodeGroup.append('g').attr('class', `node node-${n.type}`).attr('transform', `translate(${p.x},${p.y})`);
      const w = 200;
      const h = 36;
      node
        .append('rect')
        .attr('x', -w / 2)
        .attr('y', -h / 2)
        .attr('width', w)
        .attr('height', h)
        .attr('rx', 10)
        .attr('ry', 10)
        .attr('class', 'node-shape');
      node
        .append('text')
        .attr('class', 'node-label')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .text(() => (n.id.startsWith('Process ID:') ? n.id : n.name));

      node.on('click', () => { selectNode(n.id); toggleNode(n.id); });
    });
  }, [nodes, edges, layout, width, height, selectNode, toggleNode]);

  return (
    <div className="flowchart-canvas" ref={containerRef}>
      <svg ref={svgRef} role="img" aria-label="Mind Map Canvas" />
    </div>
  );
};

export default MindMapCanvas;

