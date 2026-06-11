import { useState, useCallback, useMemo } from 'react';
import CodeEditor from './components/CodeEditor';
import VariableInspector from './components/VariableInspector';
import ExecutionTimeline from './components/ExecutionTimeline';
import Whiteboard from './components/Whiteboard';
import './index.css';

const API_BASE = 'http://localhost:8765';

const DEMOS = {
  lis: {
    label: 'LIS',
    hint: 'DP · O(n²)',
    input: '6\n3 1 4 1 5 9',
    code: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int i = 0; i < n; i++) cin >> a[i];

    // Longest Increasing Subsequence O(n²)
    vector<int> dp(n, 1);
    for (int i = 1; i < n; i++) {
        for (int j = 0; j < i; j++) {
            if (a[j] < a[i]) {
                dp[i] = max(dp[i], dp[j] + 1);
            }
        }
    }

    int ans = *max_element(dp.begin(), dp.end());
    cout << ans << endl;
    return 0;
}`,
  },
  knapsack: {
    label: 'Knapsack',
    hint: 'DP · 0/1',
    input: '4 10\n2 3\n3 4\n4 5\n5 8',
    code: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, W;
    cin >> n >> W;
    vector<int> w(n), v(n);
    for (int i = 0; i < n; i++) cin >> w[i] >> v[i];

    // 0/1 Knapsack
    vector<int> dp(W + 1, 0);
    for (int i = 0; i < n; i++) {
        for (int j = W; j >= w[i]; j--) {
            dp[j] = max(dp[j], dp[j - w[i]] + v[i]);
        }
    }

    int ans = dp[W];
    cout << ans << endl;
    return 0;
}`,
  },
  dijkstra: {
    label: 'Dijkstra',
    hint: 'Graph · SSSP',
    input: '5 6\n0 1 2\n0 2 4\n1 2 1\n1 3 7\n2 4 3\n3 4 1',
    code: `#include <bits/stdc++.h>
using namespace std;

const int INF = 1e9;

int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<pair<int,int>>> adj(n);
    for (int i = 0; i < m; i++) {
        int u, v, w;
        cin >> u >> v >> w;
        adj[u].push_back({v, w});
        adj[v].push_back({u, w});
    }

    // Dijkstra's algorithm
    vector<int> dist(n, INF);
    priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> pq;
    dist[0] = 0;
    pq.push({0, 0});

    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist[u]) continue;
        for (auto [v, w] : adj[u]) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.push({dist[v], v});
            }
        }
    }

    int ans = dist[n - 1];
    cout << ans << endl;
    return 0;
}`,
  },
};

function PanelHeader({ title, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 12px', height: 34,
      borderBottom: '1px solid var(--border)', flexShrink: 0,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {title}
      </span>
      {right}
    </div>
  );
}

function ErrorBanner({ error, compileError }) {
  const msg = compileError || error;
  if (!msg) return null;
  return (
    <div style={{
      background: 'var(--red-dim)', border: '1px solid var(--red)',
      borderRadius: 6, padding: '10px 14px', margin: '10px',
      fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--red)',
      whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto',
      flexShrink: 0,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-ui)', fontSize: 12 }}>
        {compileError ? '⚠ Compile Error' : '⚠ Runtime Error'}
      </div>
      {msg}
    </div>
  );
}

export default function App() {
  const [code, setCode] = useState(DEMOS.lis.code);
  const [input, setInput] = useState(DEMOS.lis.input);
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState([]);
  const [varHistories, setVarHistories] = useState({});
  const [keyMoments, setKeyMoments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [algorithmHint, setAlgorithmHint] = useState(null);
  const [stdout, setStdout] = useState('');
  const [totalSteps, setTotalSteps] = useState(0);
  const [error, setError] = useState(null);
  const [compileError, setCompileError] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);

  // Compute active source line from current step
  const highlightLine = useMemo(() => {
    if (!events?.length || currentStep <= 0) return null;
    // Find the event at or just before currentStep
    const evt = events.slice(0, currentStep).filter(e => e.l > 0).at(-1);
    return evt?.l ?? null;
  }, [events, currentStep]);

  const resetTrace = () => {
    setEvents([]); setVarHistories({}); setKeyMoments([]);
    setSummary(null); setStdout(''); setTotalSteps(0);
    setCurrentStep(0); setError(null); setCompileError(null);
  };

  const run = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    resetTrace();
    try {
      const res = await fetch(`${API_BASE}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: code, stdin: input }),
      });
      if (!res.ok) {
        setError(`Server error ${res.status}: ${await res.text()}`);
        return;
      }
      const d = await res.json();
      if (!d.success) {
        if (d.compile_error) setCompileError(d.compile_error);
        else setError(d.error || 'Unknown error');
        return;
      }
      setEvents(d.events || []);
      setVarHistories(d.var_histories || {});
      setKeyMoments(d.key_moments || []);
      setSummary(d.summary || {});
      setAlgorithmHint(d.algorithm_hint || {});
      setStdout(d.stdout || '');
      setTotalSteps(d.total_steps || 0);
      setCurrentStep(d.total_steps || 0);
      if (d.error) setError(d.error);
    } catch (e) {
      setError(
        `Connection refused.\n\nMake sure the backend is running:\n  cd codescope/backend\n  python main.py`
      );
    } finally {
      setIsRunning(false);
    }
  }, [code, input, isRunning]);

  const loadDemo = (key) => {
    const d = DEMOS[key];
    if (!d) return;
    setCode(d.code);
    setInput(d.input);
    resetTrace();
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top Bar ─────────────────────────────────────────── */}
      <div style={{
        height: 44, background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 8, flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 6 }}>
          <div style={{
            width: 26, height: 26, background: 'var(--accent)', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 10, color: 'white',
            letterSpacing: '-0.05em',
          }}>CS</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.1 }}>CodeScope</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1 }}>C++ execution explorer</div>
          </div>
        </div>

        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 2px' }} />

        {/* Demo buttons */}
        {Object.entries(DEMOS).map(([key, demo]) => (
          <button
            key={key}
            onClick={() => loadDemo(key)}
            style={{
              padding: '4px 10px', borderRadius: 5,
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500,
              display: 'flex', flexDirection: 'column', gap: 0, lineHeight: 1.2,
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <span>{demo.label}</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{demo.hint}</span>
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Output badge */}
        {summary?.output && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-mono)', fontSize: 11,
          }}>
            <span style={{ color: 'var(--text-muted)' }}>output</span>
            <span style={{
              color: 'var(--green)', background: 'var(--green-dim)',
              border: '1px solid rgba(61,214,140,0.2)',
              padding: '2px 8px', borderRadius: 4, fontWeight: 600,
            }}>{summary.output}</span>
          </div>
        )}

        {/* Run button */}
        <button
          onClick={run}
          disabled={isRunning}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 16px', height: 30,
            background: isRunning ? 'var(--bg-raised)' : 'var(--accent)',
            color: isRunning ? 'var(--text-muted)' : 'white',
            borderRadius: 6, fontWeight: 700, fontSize: 12,
            border: 'none', cursor: isRunning ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
            letterSpacing: '0.02em',
          }}
        >
          {isRunning
            ? <><span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⟳</span> Running…</>
            : '▶  Run'
          }
        </button>
      </div>

      {/* ── Main Grid ───────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '340px 1fr 258px',
        gridTemplateRows: '1fr 210px',
        overflow: 'hidden',
        minHeight: 0,
      }}>

        {/* Code Editor */}
        <div style={{
          gridColumn: 1, gridRow: 1,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <PanelHeader title="Code" right={
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>C++17</span>
          } />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CodeEditor code={code} onChange={setCode} isRunning={isRunning} highlightLine={highlightLine} />
          </div>
        </div>

        {/* Whiteboard */}
        <div style={{
          gridColumn: 2, gridRow: 1,
          background: 'var(--bg-base)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <PanelHeader title="Whiteboard" right={
            algorithmHint?.algorithm && (
              <span style={{
                fontSize: 9, color: 'var(--text-muted)',
                background: 'var(--bg-raised)', border: '1px solid var(--border)',
                padding: '2px 7px', borderRadius: 3,
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                {algorithmHint.algorithm.replace(/_/g, ' ')}
              </span>
            )
          } />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Whiteboard
              varHistories={varHistories}
              events={events}
              currentStep={currentStep}
              algorithmHint={algorithmHint}
              summary={summary}
              stdout={stdout}
              source={code}
            />
          </div>
        </div>

        {/* Variable Inspector */}
        <div style={{
          gridColumn: 3, gridRow: 1,
          background: 'var(--bg-surface)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <VariableInspector varHistories={varHistories} currentStep={currentStep} />
        </div>

        {/* Input panel */}
        <div style={{
          gridColumn: 1, gridRow: 2,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <PanelHeader title="Input" right={
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>stdin</span>
          } />
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Test input (stdin)…"
            spellCheck={false}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              padding: '10px 12px', fontFamily: 'var(--font-mono)',
              fontSize: 12, color: 'var(--text-primary)', resize: 'none', lineHeight: 1.7,
            }}
          />
        </div>

        {/* Timeline / Error */}
        <div style={{
          gridColumn: '2 / 4', gridRow: 2,
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {(error || compileError)
            ? <ErrorBanner error={error} compileError={compileError} />
            : <ExecutionTimeline
                events={events}
                keyMoments={keyMoments}
                totalSteps={totalSteps}
                currentStep={currentStep}
                onStepChange={setCurrentStep}
                summary={summary}
              />
          }
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
