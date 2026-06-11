import { useMemo, useRef, useEffect } from 'react';

/**
 * GraphViz — renders a graph from adjacency list data detected in the trace.
 * For Dijkstra: shows nodes, edges, and highlights the dist array state.
 * Uses a simple force-ish layout for small graphs (n <= 20).
 */

function computeLayout(n, edges) {
  if (n === 0) return [];
  if (n === 1) return [{ x: 250, y: 200 }];

  // Circle layout for small graphs
  const cx = 260, cy = 180, r = Math.min(140, 30 * n);
  return Array.from({ length: n }, (_, i) => ({
    x: cx + r * Math.cos((2 * Math.PI * i) / n - Math.PI / 2),
    y: cy + r * Math.sin((2 * Math.PI * i) / n - Math.PI / 2),
  }));
}

export default function GraphViz({ distHistory, nNodes, edges, currentStep }) {
  // Get dist array at current step
  const distSnap = useMemo(() => {
    if (!distHistory?.values?.length) return null;
    let best = null;
    for (const v of distHistory.values) {
      if (v.step <= currentStep) best = v;
      else break;
    }
    return best?.value;
  }, [distHistory, currentStep]);

  const n = nNodes || (distSnap?.length) || 0;
  if (n === 0 || n > 25) return null;

  const positions = useMemo(() => computeLayout(n, edges), [n, edges]);
  const INF = 1e9;

  const maxDist = useMemo(() => {
    if (!distSnap) return 1;
    const finite = distSnap.filter(v => v < INF);
    return finite.length ? Math.max(...finite, 1) : 1;
  }, [distSnap]);

  const nodeColor = (i) => {
    if (!distSnap) return '#22263a';
    const d = distSnap[i];
    if (d >= INF) return '#1a1d26';
    if (i === 0) return '#5b8af5';  // source
    const ratio = d / maxDist;
    // green (close) → yellow (medium) → red (far)
    const r = Math.round(61 + ratio * (245 - 61));
    const g = Math.round(214 - ratio * (214 - 101));
    const b = Math.round(140 - ratio * 90);
    return `rgb(${r},${g},${b})`;
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 10, color: 'var(--text-muted)',
        letterSpacing: '0.08em', textTransform: 'uppercase',
        fontWeight: 600, marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
        Graph  ·  {n} nodes
        {distSnap && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          · step {currentStep}
        </span>}
      </div>

      <svg
        width="100%"
        viewBox="0 0 520 360"
        style={{ display: 'block', maxHeight: 280 }}
      >
        {/* Edges */}
        {edges?.map((e, i) => {
          const from = positions[e.u];
          const to = positions[e.v];
          if (!from || !to) return null;
          const distU = distSnap?.[e.u] ?? INF;
          const distV = distSnap?.[e.v] ?? INF;
          const relaxed = distV < INF && distU < INF && distU + e.w === distV;
          return (
            <g key={i}>
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={relaxed ? '#3dd68c' : '#2a2d3a'}
                strokeWidth={relaxed ? 2 : 1}
                strokeOpacity={relaxed ? 1 : 0.6}
              />
              {/* Edge weight */}
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2 - 4}
                fill={relaxed ? '#3dd68c' : '#555870'}
                fontSize="9"
                textAnchor="middle"
                fontFamily="var(--font-mono)"
              >{e.w}</text>
            </g>
          );
        })}

        {/* Nodes */}
        {positions.map((pos, i) => {
          const dist = distSnap?.[i] ?? INF;
          const isInf = dist >= INF;
          const isSource = i === 0;
          const color = nodeColor(i);

          return (
            <g key={i}>
              <circle
                cx={pos.x} cy={pos.y} r={isSource ? 18 : 15}
                fill={color}
                stroke={isSource ? '#5b8af5' : isInf ? '#2a2d3a' : '#3dd68c40'}
                strokeWidth={isSource ? 2 : 1}
              />
              {/* Node index */}
              <text
                x={pos.x} y={pos.y - 2}
                fill="white" fontSize="10"
                textAnchor="middle" dominantBaseline="middle"
                fontFamily="var(--font-mono)" fontWeight="600"
              >{i}</text>
              {/* Distance label below node */}
              <text
                x={pos.x} y={pos.y + 24}
                fill={isInf ? '#555870' : '#3dd68c'}
                fontSize="9" textAnchor="middle"
                fontFamily="var(--font-mono)" fontWeight="600"
              >{isInf ? '∞' : dist}</text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
        {[
          { color: '#5b8af5', label: 'source (node 0)' },
          { color: '#3dd68c', label: 'relaxed edge' },
          { color: '#555870', label: 'unreached (∞)' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Try to extract graph structure (edges + node count) from trace events.
 * Looks for patterns in variable names that suggest adj list construction.
 */
export function extractGraphFromTrace(varHistories, events, source) {
  // Heuristic: parse source for the edge input loop
  // Common pattern: cin >> u >> v >> w; adj[u].push_back({v,w});
  const edgeRe = /cin\s*>>\s*(\w+)\s*>>\s*(\w+)(?:\s*>>\s*(\w+))?/;
  const nRe = /cin\s*>>\s*n\s*>>\s*m|cin\s*>>\s*m\s*>>\s*n|int\s+n\s*[,;=].*int\s+m|int\s+m\s*[,;=].*int\s+n/;

  // Extract n from summary
  const nVar = varHistories?.['n']?.values?.[0]?.value;
  const mVar = varHistories?.['m']?.values?.[0]?.value;

  if (!nVar || nVar > 25) return null;

  // Try to parse edges from trace: look for u, v, w scalar variables in sequence
  const uHist = varHistories?.['u'];
  const vHist = varHistories?.['v'];
  const wHist = varHistories?.['w'];

  if (!uHist || !vHist) return null;

  const edges = [];
  const uVals = uHist.values || [];
  const vVals = vHist.values || [];
  const wVals = wHist?.values || [];

  // Match u, v (and w if present) by step proximity
  for (let i = 0; i < Math.min(uVals.length, vVals.length, 30); i++) {
    const u = uVals[i]?.value;
    const v = vVals[i]?.value;
    const w = wVals[i]?.value ?? 1;
    if (typeof u === 'number' && typeof v === 'number' && u >= 0 && v >= 0 && u < nVar && v < nVar) {
      edges.push({ u, v, w });
    }
  }

  if (edges.length === 0) return null;

  return { n: nVar, edges };
}
