import { useState, useMemo, useEffect, useRef } from 'react';

const ANS_NAMES = new Set(['ans', 'answer', 'result', 'res', 'ret', 'output']);

// ─── Get snapshot at step ────────────────────────────────────────
function snapAt(history, step) {
  if (!history?.values?.length) return null;
  let best = null;
  for (const v of history.values) {
    if (v.step <= step) best = v;
    else break;
  }
  return best;
}

// ─── Value renderer ──────────────────────────────────────────────
function Val({ value, type_hint }) {
  if (value === null || value === undefined) return <span style={{ color: 'var(--text-muted)' }}>—</span>;

  if (type_hint === 'array' || Array.isArray(value)) {
    const arr = Array.isArray(value) ? value : [];
    const preview = arr.slice(0, 6).map(v => (typeof v === 'number' && v >= 1e9 ? '∞' : v)).join(', ');
    return (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#22d3ee' }}>
        [{preview}{arr.length > 6 ? ', …' : ''}]
      </span>
    );
  }

  const s = String(value);
  const isNum = typeof value === 'number';
  const isBig = isNum && Math.abs(value) >= 1e9;
  const isBool = typeof value === 'boolean';

  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
      color: isBool ? '#a78bfa' : isBig ? 'var(--text-muted)' : '#3dd68c',
    }}>
      {isBig ? (value >= 1e18 ? '∞' : s) : s}
    </span>
  );
}

// ─── Mini array strip for scalar change history ──────────────────
function ChangeHistory({ values, currentStep }) {
  const recent = useMemo(() =>
    values.filter(v => v.step <= currentStep).slice(-6).reverse(),
    [values, currentStep]
  );
  if (recent.length < 2) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 1 }}>History</span>
      {recent.map((e, i) => (
        <div key={e.step} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: i === 0 ? 1 : 0.4 + i * 0.1 }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 28, textAlign: 'right' }}>s{e.step}</span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>→</span>
          <Val value={e.value} />
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>:{e.line}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Array cell visualizer ───────────────────────────────────────
function ArrayCells({ arr, name }) {
  const nums = arr.filter(v => typeof v === 'number' && isFinite(v) && v < 1e9);
  const max = nums.length ? Math.max(...nums.map(Math.abs), 1) : 1;
  const color = name.startsWith('dp') ? '#3dd68c' : name.startsWith('dist') ? '#5b8af5' : '#22d3ee';

  return (
    <div style={{ marginTop: 6, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {arr.slice(0, 20).map((v, i) => {
        const isInf = typeof v === 'number' && v >= 1e9;
        const ratio = isInf ? 0 : (typeof v === 'number' ? Math.abs(v) / max : 0);
        return (
          <div key={i} title={`[${i}] = ${v}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <div style={{
              width: 20, height: 18,
              background: isInf ? 'var(--bg-hover)' : `${color}${Math.round(30 + ratio * 180).toString(16).padStart(2,'0')}`,
              border: `1px solid ${color}30`,
              borderRadius: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontFamily: 'var(--font-mono)',
              color: isInf ? 'var(--text-muted)' : 'var(--text-primary)',
            }}>
              {isInf ? '∞' : typeof v === 'number' ? (Math.abs(v) > 99 ? '..' : v) : '?'}
            </div>
            <span style={{ fontSize: 7, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{i}</span>
          </div>
        );
      })}
      {arr.length > 20 && (
        <span style={{ fontSize: 9, color: 'var(--text-muted)', alignSelf: 'center' }}>+{arr.length-20}</span>
      )}
    </div>
  );
}

// ─── Variable Card ───────────────────────────────────────────────
function VarCard({ name, history, currentStep }) {
  const [expanded, setExpanded] = useState(false);
  const prevStepRef = useRef(null);
  const [flashing, setFlashing] = useState(false);

  const snap = useMemo(() => snapAt(history, currentStep), [history, currentStep]);
  const isAnswer = history.is_answer || ANS_NAMES.has(name);
  const isArray = history.type_hint === 'array';
  const changeCount = history.values?.length || 0;

  // Flash on change
  useEffect(() => {
    if (snap && prevStepRef.current !== null && snap.step !== prevStepRef.current) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 500);
      return () => clearTimeout(t);
    }
    if (snap) prevStepRef.current = snap.step;
  }, [snap]);

  return (
    <div
      onClick={() => !isArray && setExpanded(e => !e)}
      style={{
        background: isAnswer ? 'var(--accent-dim)' : 'var(--bg-raised)',
        border: `1px solid ${flashing ? 'var(--accent)' : isAnswer ? '#1e2d52' : 'var(--border)'}`,
        borderRadius: 6, padding: '7px 10px',
        cursor: isArray ? 'default' : 'pointer',
        transition: 'border-color 0.3s',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Flash overlay */}
      {flashing && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(91,138,245,0.1)',
          pointerEvents: 'none',
          animation: 'fadeout 0.5s ease-out forwards',
        }} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isAnswer && (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
              color: 'var(--accent)', background: 'var(--accent-dim)',
              border: '1px solid var(--accent)', padding: '1px 4px', borderRadius: 2, textTransform: 'uppercase',
            }}>ANS</span>
          )}
          {isArray && !isAnswer && (
            <span style={{
              fontSize: 8, fontWeight: 700, color: '#22d3ee',
              background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)',
              padding: '1px 4px', borderRadius: 2, textTransform: 'uppercase',
            }}>ARR</span>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 12, color: 'var(--text-primary)' }}>
            {name}
          </span>
          {changeCount > 1 && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>×{changeCount}</span>
          )}
        </div>
        <Val value={snap?.value} type_hint={history.type_hint} />
      </div>

      {isArray && snap && Array.isArray(snap.value) && (
        <ArrayCells arr={snap.value} name={name} />
      )}

      {!isArray && expanded && history.values && (
        <ChangeHistory values={history.values} currentStep={currentStep} />
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────
export default function VariableInspector({ varHistories, currentStep }) {
  const [filter, setFilter] = useState('');

  const entries = useMemo(() => {
    if (!varHistories) return [];
    return Object.entries(varHistories)
      .filter(([name]) => !filter || name.toLowerCase().includes(filter.toLowerCase()))
      .sort(([nameA, a], [nameB, b]) => {
        const aAns = a.is_answer || ANS_NAMES.has(nameA);
        const bAns = b.is_answer || ANS_NAMES.has(nameB);
        if (aAns && !bAns) return -1;
        if (!aAns && bAns) return 1;
        return (b.values?.length || 0) - (a.values?.length || 0);
      });
  }, [varHistories, filter]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0 10px', height: 34,
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>State</span>
          {entries.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '0 5px', borderRadius: 3 }}>
              {entries.length}
            </span>
          )}
        </div>
        {entries.length > 0 && (
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="filter…"
            style={{
              background: 'var(--bg-base)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '2px 6px',
              color: 'var(--text-primary)', fontSize: 11,
              fontFamily: 'var(--font-mono)', width: 80, outline: 'none',
            }}
          />
        )}
      </div>

      {/* Entries */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {entries.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: 'var(--text-muted)', textAlign: 'center' }}>
            <div style={{ fontSize: 26, opacity: 0.4 }}>⬡</div>
            <div style={{ fontSize: 12 }}>Run code to<br />inspect state</div>
          </div>
        )}
        {entries.map(([name, h]) => (
          <VarCard key={name} name={name} history={h} currentStep={currentStep} />
        ))}
      </div>

      <style>{`
        @keyframes fadeout { from { opacity: 1; } to { opacity: 0; } }
      `}</style>
    </div>
  );
}
