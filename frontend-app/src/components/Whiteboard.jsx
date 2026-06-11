import { useMemo } from 'react';
import GraphViz, { extractGraphFromTrace } from './GraphViz';

function snapAt(history, step) {
  if (!history?.values?.length) return null;
  let best = null;
  for (const v of history.values) {
    if (v.step <= step) best = v;
    else break;
  }
  return best;
}

function SectionLabel({ children, color }) {
  return (
    <div style={{
      fontSize: 10, color: color || 'var(--text-muted)',
      letterSpacing: '0.09em', textTransform: 'uppercase',
      fontWeight: 700, marginBottom: 8,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color || 'var(--text-muted)', display: 'inline-block', flexShrink: 0 }} />
      {children}
    </div>
  );
}

// ── Array bar chart ─────────────────────────────────────────────
function ArrayViz({ name, history, currentStep }) {
  const snap = snapAt(history, currentStep);
  if (!snap || !Array.isArray(snap.value)) return null;

  const arr = snap.value;
  const nums = arr.filter(v => typeof v === 'number' && isFinite(v) && v < 1e9);
  const maxVal = nums.length ? Math.max(...nums.map(Math.abs), 1) : 1;
  const isDist = name.startsWith('dist') || name === 'd';
  const isDp = name.startsWith('dp');
  const color = isDist ? '#5b8af5' : isDp ? '#3dd68c' : '#22d3ee';

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ color }}>{name}</span>
        <span style={{ color: 'var(--text-muted)' }}>[{arr.length}]</span>
        <span style={{
          fontSize: 9, color: 'var(--text-muted)',
          background: 'var(--bg-raised)', border: '1px solid var(--border)',
          padding: '1px 5px', borderRadius: 2,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>s{snap.step}</span>
      </div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {arr.slice(0, 50).map((v, i) => {
          const isInf = typeof v === 'number' && v >= 1e9;
          const ratio = isInf ? 0 : (typeof v === 'number' ? Math.abs(v) / maxVal : 0);
          const barH = Math.max(4, ratio * 52);
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <div style={{
                width: 26, height: barH,
                background: isInf ? 'var(--bg-hover)' : `${color}${Math.round(40 + ratio * 180).toString(16).padStart(2, '0')}`,
                borderRadius: '2px 2px 0 0',
                border: `1px solid ${color}30`,
                borderBottom: 'none',
                transition: 'height 0.25s ease',
              }} />
              <div style={{
                width: 26, height: 20,
                background: 'var(--bg-raised)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontFamily: 'var(--font-mono)',
                color: isInf ? 'var(--text-muted)' : 'var(--text-primary)',
              }}>
                {isInf ? '∞' : typeof v === 'number' ? (Math.abs(v) > 9999 ? '..' : v) : '?'}
              </div>
              <span style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{i}</span>
            </div>
          );
        })}
        {arr.length > 50 && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>+{arr.length - 50}</span>
        )}
      </div>
    </div>
  );
}

// ── Event feed ──────────────────────────────────────────────────
function EventFeed({ events, currentStep }) {
  const visible = useMemo(() => {
    if (!events?.length) return [];
    return events
      .filter(e => e.s >= Math.max(0, currentStep - 10) && e.s <= currentStep)
      .slice(-12)
      .reverse();
  }, [events, currentStep]);

  const TC = { var: '#22d3ee', arr: '#3dd68c', ans: '#5b8af5', loop: '#f5c542', call: '#a78bfa', ret: '#555870', cond: '#fb923c' };

  return (
    <div>
      <SectionLabel>Recent Events</SectionLabel>
      {visible.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>No events at this step</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visible.map((e, i) => {
          const c = TC[e.t] || 'var(--text-muted)';
          const isLatest = i === 0;
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '3px 6px', borderRadius: 4,
              background: isLatest ? 'var(--bg-hover)' : 'transparent',
              opacity: isLatest ? 1 : Math.max(0.2, 0.9 - i * 0.09),
            }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 28, textAlign: 'right' }}>s{e.s}</span>
              <span style={{ fontSize: 8, color: c, background: `${c}18`, padding: '1px 4px', borderRadius: 2, minWidth: 22, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{e.t}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {e.n}
                {e.v !== null && e.v !== undefined && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {' = '}<span style={{ color: c }}>
                      {Array.isArray(e.v)
                        ? `[${e.v.slice(0, 5).map(x => x >= 1e9 ? '∞' : x).join(', ')}${e.v.length > 5 ? '…' : ''}]`
                        : String(e.v).length > 24 ? String(e.v).slice(0, 24) + '…' : String(e.v)}
                    </span>
                  </span>
                )}
              </span>
              {e.l > 0 && <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>:{e.l}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Answer + output display ─────────────────────────────────────
function AnswerDisplay({ summary, stdout }) {
  const answers = summary?.final_answers;
  if (!answers && !stdout) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      {answers && Object.keys(answers).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SectionLabel color="var(--accent)">Answer</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(answers).map(([k, v]) => (
              <div key={k} style={{
                background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                borderRadius: 8, padding: '8px 14px',
              }}>
                <div style={{ fontSize: 9, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{k}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 22, color: 'var(--text-primary)' }}>{String(v)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {stdout && (
        <div>
          <SectionLabel color="var(--green)">Output</SectionLabel>
          <pre style={{
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green)',
            background: 'var(--green-dim)', border: '1px solid rgba(61,214,140,0.2)',
            borderRadius: 6, padding: '8px 12px',
            whiteSpace: 'pre-wrap', maxHeight: 100, overflowY: 'auto',
          }}>{stdout.trim()}</pre>
        </div>
      )}
    </div>
  );
}

// ── Execution summary bar ───────────────────────────────────────
function ExecSummary({ summary, algorithmHint, totalSteps }) {
  if (!summary) return null;
  return (
    <div style={{
      background: 'var(--bg-raised)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', marginBottom: 18,
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        {[
          { label: 'Steps', val: totalSteps, color: 'var(--text-secondary)' },
          { label: 'Variables', val: summary.total_variables, color: 'var(--cyan)' },
          { label: '★ Moments', val: summary.key_moment_count, color: 'var(--yellow)' },
          summary.dp_improvements > 0 && { label: 'DP impr', val: summary.dp_improvements, color: 'var(--green)' },
          summary.path_improvements > 0 && { label: 'Paths', val: summary.path_improvements, color: 'var(--accent)' },
        ].filter(Boolean).map(s => (
          <div key={s.label}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 1 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: s.color }}>{s.val}</div>
          </div>
        ))}
        {algorithmHint?.algorithm && (
          <div style={{ marginLeft: 'auto' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 1 }}>Detected</div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: algorithmHint.type === 'graph' ? 'var(--accent)' : algorithmHint.type?.startsWith('dp') ? 'var(--green)' : 'var(--cyan)',
            }}>{algorithmHint.algorithm.replace(/_/g, ' ')}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Whiteboard ─────────────────────────────────────────────
export default function Whiteboard({ varHistories, events, currentStep, algorithmHint, summary, stdout, source }) {
  const isGraph = algorithmHint?.type === 'graph';

  const arrayVars = useMemo(() => {
    if (!varHistories) return [];
    return Object.entries(varHistories)
      .filter(([, h]) => h.type_hint === 'array')
      .sort(([a], [b]) => {
        const pri = n => n.startsWith('dp') ? 0 : (n.startsWith('dist') || n === 'd') ? 1 : 2;
        return pri(a) - pri(b) || a.localeCompare(b);
      });
  }, [varHistories]);

  // Try to extract graph structure for graph algorithms
  const graphData = useMemo(() => {
    if (!isGraph || !varHistories) return null;
    return extractGraphFromTrace(varHistories, events, source);
  }, [isGraph, varHistories, events, source]);

  const distHistory = varHistories?.['dist'] || varHistories?.['d'];
  const hasData = !!events?.length;
  const totalSteps = events?.length || 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 18px' }}>
      {!hasData ? (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          height: '100%', gap: 12, color: 'var(--text-muted)', textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 36, opacity: 0.12, letterSpacing: '-0.05em' }}>{'{ }'}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Whiteboard</div>
          <div style={{ fontSize: 12, lineHeight: 1.7, maxWidth: 220 }}>
            Paste your C++ code, add a test case,<br />and hit <strong style={{ color: 'var(--accent)' }}>Run</strong>.
          </div>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
            {['DP arrays shown as bar charts', 'Graph nodes colored by distance', 'Time-travel through every step', 'Key moments auto-detected'].map(t => (
              <div key={t} style={{ color: 'var(--text-muted)' }}>→ {t}</div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <ExecSummary summary={summary} algorithmHint={algorithmHint} totalSteps={totalSteps} />
          <AnswerDisplay summary={summary} stdout={stdout} />

          {/* Graph visualization for Dijkstra/BFS */}
          {isGraph && graphData && distHistory && (
            <div style={{ marginBottom: 20 }}>
              <SectionLabel color="var(--accent)">Graph · Distance State</SectionLabel>
              <GraphViz
                distHistory={distHistory}
                nNodes={graphData.n}
                edges={graphData.edges}
                currentStep={currentStep}
              />
            </div>
          )}

          {/* Array visualizations */}
          {arrayVars.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <SectionLabel color={
                isGraph ? 'var(--accent)' : algorithmHint?.type?.startsWith('dp') ? 'var(--green)' : 'var(--cyan)'
              }>
                {isGraph ? 'Distance Arrays' : 'Array State'} · step {currentStep}
              </SectionLabel>
              {arrayVars.map(([name, hist]) => (
                <ArrayViz key={name} name={name} history={hist} currentStep={currentStep} />
              ))}
            </div>
          )}

          <EventFeed events={events} currentStep={currentStep} />
        </>
      )}
    </div>
  );
}
