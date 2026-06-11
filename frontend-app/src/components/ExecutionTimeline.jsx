import { useRef, useEffect, useMemo, useCallback } from 'react';

const KIND = {
  answer_update:    { color: '#5b8af5', icon: '★', label: 'Answer' },
  path_improvement: { color: '#3dd68c', icon: '↘', label: 'Path' },
  dp_improvement:   { color: '#f5c542', icon: '▲', label: 'DP' },
  fn_call:          { color: '#a78bfa', icon: 'ƒ', label: 'Call' },
};
const DEFAULT_KIND = { color: 'var(--text-muted)', icon: '·', label: 'Event' };

// ─── Keyboard shortcut listener ─────────────────────────────────
function useKeyboardNav(currentStep, totalSteps, keyMoments, onStepChange) {
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        onStepChange(Math.min(totalSteps, currentStep + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'h') {
        e.preventDefault();
        onStepChange(Math.max(0, currentStep - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        // Jump to previous key moment
        const prev = [...keyMoments].reverse().find(m => m.step < currentStep);
        if (prev) onStepChange(prev.step);
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        // Jump to next key moment
        const next = keyMoments.find(m => m.step > currentStep);
        if (next) onStepChange(next.step);
      } else if (e.key === 'Home') {
        onStepChange(0);
      } else if (e.key === 'End') {
        onStepChange(totalSteps);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentStep, totalSteps, keyMoments, onStepChange]);
}

// ─── Scrubber ───────────────────────────────────────────────────
function Scrubber({ currentStep, totalSteps, keyMoments, onStepChange }) {
  const trackRef = useRef(null);
  const dragging = useRef(false);
  const pct = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  const posToStep = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onStepChange(Math.round(ratio * totalSteps));
  }, [totalSteps, onStepChange]);

  useEffect(() => {
    const move = (e) => { if (dragging.current) posToStep(e.clientX); };
    const up = () => { dragging.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [posToStep]);

  return (
    <div
      ref={trackRef}
      onMouseDown={(e) => { dragging.current = true; posToStep(e.clientX); }}
      onClick={(e) => posToStep(e.clientX)}
      style={{ position: 'relative', height: 24, cursor: 'pointer', userSelect: 'none', padding: '10px 0' }}
    >
      {/* Track */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 3, background: 'var(--border)', borderRadius: 2 }} />
      {/* Fill */}
      <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: `${pct}%`, height: 3, background: 'var(--accent)', borderRadius: 2 }} />

      {/* Key moment pips */}
      {keyMoments?.map((m, i) => {
        const p = totalSteps > 0 ? (m.step / totalSteps) * 100 : 0;
        const cfg = KIND[m.kind] || DEFAULT_KIND;
        const isActive = m.step <= currentStep;
        return (
          <div
            key={i}
            onClick={(e) => { e.stopPropagation(); onStepChange(m.step); }}
            title={m.description}
            style={{
              position: 'absolute', left: `${p}%`, top: '50%',
              transform: 'translate(-50%, -50%)',
              width: isActive ? 8 : 6, height: isActive ? 8 : 6,
              borderRadius: '50%', background: cfg.color,
              cursor: 'pointer', zIndex: 2,
              boxShadow: isActive ? `0 0 0 2px ${cfg.color}40` : 'none',
              transition: 'width .1s, height .1s',
            }}
          />
        );
      })}

      {/* Playhead */}
      <div style={{
        position: 'absolute', left: `${pct}%`, top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 13, height: 13, borderRadius: '50%',
        background: 'white', border: '2px solid var(--accent)',
        boxShadow: '0 0 0 3px rgba(91,138,245,0.2)',
        zIndex: 5, pointerEvents: 'none',
      }} />
    </div>
  );
}

// ─── Moment Card ────────────────────────────────────────────────
function MomentCard({ moment, isActive, onClick }) {
  const cfg = KIND[moment.kind] || DEFAULT_KIND;
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
        background: isActive ? 'var(--bg-hover)' : 'transparent',
        border: `1px solid ${isActive ? 'var(--border-light)' : 'transparent'}`,
        transition: 'background .1s',
      }}
    >
      <span style={{ color: cfg.color, fontSize: 13, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{cfg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, color: 'var(--text-primary)', fontWeight: 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {moment.description}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 2, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>s{moment.step}</span>
          {moment.line > 0 && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>line {moment.line}</span>}
          <span style={{
            fontSize: 8, color: cfg.color, background: `${cfg.color}18`,
            padding: '1px 4px', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>{cfg.label}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Row ──────────────────────────────────────────────────
function StatsRow({ summary, totalSteps }) {
  if (!summary) return null;
  const stats = [
    { label: 'steps', val: totalSteps, color: 'var(--text-secondary)' },
    { label: 'vars', val: summary.total_variables, color: 'var(--cyan)' },
    { label: '★ moments', val: summary.key_moment_count, color: 'var(--yellow)' },
    summary.dp_improvements > 0 && { label: 'DP impr', val: summary.dp_improvements, color: 'var(--green)' },
    summary.path_improvements > 0 && { label: 'paths', val: summary.path_improvements, color: 'var(--accent)' },
  ].filter(Boolean);

  return (
    <div style={{ display: 'flex', gap: 16, padding: '6px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      {stats.map(s => (
        <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{s.label}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: s.color }}>{s.val}</span>
        </div>
      ))}
      {summary.output && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
            → {summary.output.slice(0, 30)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────
export default function ExecutionTimeline({ events, keyMoments, totalSteps, currentStep, onStepChange, summary }) {
  const listRef = useRef(null);

  useKeyboardNav(currentStep, totalSteps, keyMoments || [], onStepChange);

  const activeMomentIdx = useMemo(() => {
    if (!keyMoments?.length) return -1;
    let best = -1;
    for (let i = 0; i < keyMoments.length; i++) {
      if (keyMoments[i].step <= currentStep) best = i;
      else break;
    }
    return best;
  }, [keyMoments, currentStep]);

  // Auto-scroll active moment into view
  useEffect(() => {
    if (activeMomentIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[activeMomentIdx];
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeMomentIdx]);

  const hasData = totalSteps > 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{
        padding: '0 12px', height: 34,
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Timeline
        </span>
        {hasData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'none' }}>← → to step · ↑ ↓ for moments</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>
              {currentStep} / {totalSteps}
            </span>
            <div style={{ display: 'flex', gap: 3 }}>
              {[
                { label: '|◀', title: 'Start (Home)', action: () => onStepChange(0) },
                { label: '◀', title: 'Prev moment (↑)', action: () => { const p = [...(keyMoments||[])].reverse().find(m => m.step < currentStep); if (p) onStepChange(p.step); } },
                { label: '‹', title: 'Prev step (←)', action: () => onStepChange(Math.max(0, currentStep - 1)) },
                { label: '›', title: 'Next step (→)', action: () => onStepChange(Math.min(totalSteps, currentStep + 1)) },
                { label: '▶', title: 'Next moment (↓)', action: () => { const n = (keyMoments||[]).find(m => m.step > currentStep); if (n) onStepChange(n.step); } },
                { label: '▶|', title: 'End (End)', action: () => onStepChange(totalSteps) },
              ].map(btn => (
                <button
                  key={btn.label}
                  onClick={btn.action}
                  title={btn.title}
                  style={{
                    width: 22, height: 22,
                    background: 'var(--bg-raised)', border: '1px solid var(--border)',
                    borderRadius: 4, color: 'var(--text-secondary)',
                    fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >{btn.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Scrubber */}
      {hasData && (
        <div style={{ padding: '0 12px', flexShrink: 0 }}>
          <Scrubber
            currentStep={currentStep}
            totalSteps={totalSteps}
            keyMoments={keyMoments}
            onStepChange={onStepChange}
          />
        </div>
      )}

      {/* Stats */}
      {hasData && <StatsRow summary={summary} totalSteps={totalSteps} />}

      {/* Keyboard hint */}
      {hasData && (
        <div style={{ padding: '3px 12px', flexShrink: 0 }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            ← → step  ·  ↑ ↓ jump moments  ·  click pip to jump
          </span>
        </div>
      )}

      {/* Key moments list */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
        {!hasData && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 8,
            color: 'var(--text-muted)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 22 }}>⏱</div>
            <div style={{ fontSize: 12 }}>Key moments appear<br />after execution</div>
          </div>
        )}
        {(keyMoments || []).map((m, i) => (
          <MomentCard
            key={i}
            moment={m}
            isActive={i === activeMomentIdx}
            onClick={() => onStepChange(m.step)}
          />
        ))}
      </div>
    </div>
  );
}
