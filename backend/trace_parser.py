"""
CodeScope Trace Parser
Converts raw JSONL trace → structured ExecutionTrace with:
- Per-variable full history
- Key moments (DP improvements, path relaxations, answer changes)
- Execution summary
"""
import json
from dataclasses import dataclass, field, asdict
from typing import Any, Optional
from collections import defaultdict


@dataclass
class TraceEvent:
    s: int      # step
    t: str      # type: var | arr | ans | call | ret | loop | cond
    n: str      # name
    v: Any      # value
    l: int      # line
    fn: str     # function


@dataclass
class VarHistory:
    name: str
    values: list = field(default_factory=list)   # [{step, value, line, fn}]
    is_answer: bool = False
    type_hint: str = 'scalar'                    # scalar | array


@dataclass
class KeyMoment:
    step: int
    kind: str           # answer_update | dp_improvement | path_improvement | fn_call
    description: str
    line: int
    fn: str
    data: dict = field(default_factory=dict)


@dataclass
class ExecutionTrace:
    events: list = field(default_factory=list)
    var_histories: dict = field(default_factory=dict)
    key_moments: list = field(default_factory=list)
    summary: dict = field(default_factory=dict)
    stdout: str = ""
    total_steps: int = 0
    algorithm_hint: dict = field(default_factory=dict)


def parse_trace(stderr_output: str, stdout_output: str, algo_hint: dict) -> ExecutionTrace:
    trace = ExecutionTrace()
    trace.stdout = stdout_output
    trace.algorithm_hint = algo_hint

    var_histories: dict[str, VarHistory] = {}
    events: list[TraceEvent] = []

    for raw in stderr_output.strip().split('\n'):
        raw = raw.strip()
        if not raw or raw[0] != '{':
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue

        e = TraceEvent(
            s=obj.get('s', 0),
            t=obj.get('t', 'var'),
            n=obj.get('n', ''),
            v=obj.get('v'),
            l=obj.get('l', 0),
            fn=obj.get('fn', ''),
        )
        events.append(e)

        if e.t in ('var', 'arr', 'ans'):
            name = e.n
            if name not in var_histories:
                var_histories[name] = VarHistory(
                    name=name,
                    is_answer=(e.t == 'ans'),
                    type_hint='array' if e.t == 'arr' else 'scalar',
                )
            var_histories[name].values.append({
                'step': e.s, 'value': e.v, 'line': e.l, 'fn': e.fn,
            })

    trace.events = [{'s': e.s, 't': e.t, 'n': e.n, 'v': e.v, 'l': e.l, 'fn': e.fn} for e in events]
    trace.var_histories = {k: asdict(v) for k, v in var_histories.items()}
    trace.total_steps = len(events)

    # ── Key Moment Detection ────────────────────────────────────────
    key_moments: list[KeyMoment] = []

    for name, hist in var_histories.items():
        vals = hist.values
        if not vals:
            continue

        # Answer variable changes
        if hist.is_answer:
            for i in range(1, len(vals)):
                prev, curr = vals[i-1]['value'], vals[i]['value']
                if curr != prev:
                    key_moments.append(KeyMoment(
                        step=vals[i]['step'], kind='answer_update',
                        description=f"Answer '{name}' updated: {prev} → {curr}",
                        line=vals[i]['line'], fn=vals[i]['fn'],
                        data={'var': name, 'from': prev, 'to': curr},
                    ))

        # DP array cell improvements
        if name.startswith('dp') and hist.type_hint == 'array':
            for i in range(1, len(vals)):
                prev_arr = vals[i-1]['value']
                curr_arr = vals[i]['value']
                if not (isinstance(curr_arr, list) and isinstance(prev_arr, list)):
                    continue
                for j in range(min(len(prev_arr), len(curr_arr))):
                    a, b = prev_arr[j], curr_arr[j]
                    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and b > a and b < 1e9:
                        key_moments.append(KeyMoment(
                            step=vals[i]['step'], kind='dp_improvement',
                            description=f"dp[{j}] improved: {a} → {b}",
                            line=vals[i]['line'], fn=vals[i]['fn'],
                            data={'idx': j, 'from': a, 'to': b},
                        ))

        # Distance/shortest-path improvements
        if (name.startswith('dist') or name == 'd') and hist.type_hint == 'array':
            for i in range(1, len(vals)):
                prev_arr = vals[i-1]['value']
                curr_arr = vals[i]['value']
                if not (isinstance(curr_arr, list) and isinstance(prev_arr, list)):
                    continue
                for j in range(min(len(prev_arr), len(curr_arr))):
                    a, b = prev_arr[j], curr_arr[j]
                    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and b < a:
                        key_moments.append(KeyMoment(
                            step=vals[i]['step'], kind='path_improvement',
                            description=f"Shorter path to node {j}: {a if a < 1e9 else '∞'} → {b}",
                            line=vals[i]['line'], fn=vals[i]['fn'],
                            data={'node': j, 'from': a, 'to': b},
                        ))

    # Function calls (only interesting ones, not 'main')
    fn_calls = [e for e in events if e.t == 'call' and e.n not in ('main',)]
    seen_fns = set()
    for fc in fn_calls[:10]:
        if fc.n not in seen_fns:
            seen_fns.add(fc.n)
            key_moments.append(KeyMoment(
                step=fc.s, kind='fn_call',
                description=f"Function '{fc.n}' called",
                line=fc.l, fn=fc.fn, data={'fn': fc.n},
            ))

    key_moments.sort(key=lambda x: x.step)
    trace.key_moments = [asdict(km) for km in key_moments]

    # ── Summary ─────────────────────────────────────────────────────
    ans_vars = {n: h for n, h in var_histories.items() if h.is_answer}
    final_answers = {n: h.values[-1]['value'] if h.values else None for n, h in ans_vars.items()}

    trace.summary = {
        'total_steps': trace.total_steps,
        'total_variables': len(var_histories),
        'answer_variables': list(final_answers.keys()),
        'final_answers': final_answers,
        'key_moment_count': len(key_moments),
        'answer_updates': sum(1 for km in key_moments if km.kind == 'answer_update'),
        'path_improvements': sum(1 for km in key_moments if km.kind == 'path_improvement'),
        'dp_improvements': sum(1 for km in key_moments if km.kind == 'dp_improvement'),
        'functions_called': list({e.fn for e in events if e.t == 'call'}),
        'output': stdout_output.strip(),
    }

    return trace
