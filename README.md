# CodeScope

**Interactive C++ execution workspace for competitive programmers.**

Paste a solution. Add a test input. See exactly how execution unfolds — which DP cells improved, which paths got relaxed, how the answer emerged.

---

## Quick Start

```bash
# Prerequisites: g++, python3, node 18+

./start.sh
# Opens at http://localhost:8000
```

---

## What it does

You paste a C++ solution (e.g. Dijkstra, LIS, Knapsack) and a test input. CodeScope:

1. **Instruments** your source — injects trace macros at every variable assignment, array write, and function entry
2. **Compiles** with `g++ -std=c++17 -O0`
3. **Executes** with your input, capturing a structured trace from stderr
4. **Parses** the trace into a full execution timeline with key moments
5. **Displays** everything in an interactive workspace you can scrub through

---

## UI Layout

```
┌──────────────┬──────────────────────┬─────────────┐
│   Code       │     Whiteboard       │    State    │
│  (editor)    │  (array viz +        │  Inspector  │
│              │   event feed)        │             │
├──────────────┼──────────────────────┴─────────────┤
│   Input      │     Execution Timeline              │
│   (stdin)    │  (scrubber + key moments)           │
└──────────────┴─────────────────────────────────────┘
```

**Keyboard navigation (focus outside editor):**
- `← →` — step one event forward/back
- `↑ ↓` — jump between key moments
- `Home / End` — jump to start/end
- Click pips on scrubber to jump to key moments

---

## Architecture

```
backend/
  instrumentor.py   — C++ source transformation (two-pass injection)
  runner.py         — subprocess compile + execute with resource limits  
  trace_parser.py   — JSONL trace → structured ExecutionTrace
  main.py           — FastAPI server (POST /api/run)
  static/           — compiled frontend (auto-served)

frontend-app/
  src/
    App.jsx                    — workspace layout + run logic
    components/
      CodeEditor.jsx           — CodeMirror 6 + C++ syntax
      Whiteboard.jsx           — array viz + event feed
      VariableInspector.jsx    — per-variable state + history
      ExecutionTimeline.jsx    — scrubber + key moments + keyboard nav
```

**Instrumentation strategy:**
- Pass 1: Line-by-line regex — inject `_CSV`/`_CSA`/`_CSN` macros after declarations and scalar assignments
- Pass 2: Post-pass over instrumented source — inject `_CSA` snapshots after any `arr[...] =` line
- Each macro writes a compact JSON line to stderr: `{"s":42,"t":"arr","n":"dp","v":[1,2,3],"l":15,"fn":"main"}`
- Stderr is fully separated from stdout in the runner

**Trace format:**
```json
{"s": 42, "t": "arr", "n": "dp", "v": [1,1,2,1,3,4], "l": 15, "fn": "main"}
```
- `s` = step number (global counter)
- `t` = type: `var` | `arr` | `ans` | `call` | `ret`
- `n` = variable name
- `v` = current value (scalar or JSON array)
- `l` = source line number
- `fn` = enclosing function

---

## Supported

- Variables (int, long long, double, bool, char, auto)
- Vectors (any element type with `std::to_string` or `J()`)
- Nested loops, recursion (via function entry injection)
- Answer detection (variables named `ans`, `answer`, `result`, `res`, `ret`)
- Algorithm detection heuristics: Dijkstra, BFS, DFS, DP-1D, DP-2D, graph

## V1 Limitations

- Templates and macros (e.g. `#define int long long`) may cause instrumentation gaps
- 2D `dp[i][j] = ...` — snapshot is the full row that was written, not cell-level
- No graph visualization (planned for V2)
- No segment tree / advanced data structure internals
- Max 80,000 trace events before truncation (configurable in `instrumentor.py`)

---

## V2 Roadmap

- Graph node/edge visualization (Dijkstra, BFS paths drawn)  
- 2D DP table heatmap renderer
- Macro expansion pre-pass (`#define int long long` etc.)
- Step-level line highlighting synced to editor
- Share execution traces as permalinks
- AI-generated natural language explanation of each key moment
