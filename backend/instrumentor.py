"""
CodeScope Instrumentation Engine v4
Two-pass injection with preprocessor integration.
Supports: #define int long long, typedef ll, using aliases, raw arrays.
"""

import re
from preprocessor import preprocess, build_scalar_pattern, build_container_pattern

TRACE_HEADER = r"""
#include <bits/stdc++.h>

// ============================================================
// CodeScope Trace Runtime
// ============================================================
namespace __cs {

static int __step = 0;
static const int __MAX = 100000;

inline void emit(const char* type, const char* name, const std::string& val,
                 int line, const char* fn = "") {
    if (__step >= __MAX) return;
    fprintf(stderr, "{\"s\":%d,\"t\":\"%s\",\"n\":\"%s\",\"v\":%s,\"l\":%d,\"fn\":\"%s\"}\n",
            ++__step, type, name, val.c_str(), line, fn);
}

template<typename T>
std::string J(const T& v) {
    if constexpr (std::is_same_v<T, bool>) return v ? "true" : "false";
    else if constexpr (std::is_same_v<T, std::string>) return "\"" + v + "\"";
    else if constexpr (std::is_same_v<T, char>) return "\"" + std::string(1, v) + "\"";
    else return std::to_string(v);
}

template<typename C>
std::string JA(const C& c, int mx = 64) {
    std::string s = "["; int i = 0;
    for (const auto& x : c) {
        if (i) s += ",";
        s += J(x);
        if (++i >= mx) { s += ",\"...\""; break; }
    }
    return s + "]";
}

template<typename T, size_t N>
std::string JRaw(const T (&arr)[N], int mx = 64) {
    std::string s = "[";
    for (int i = 0; i < (int)N && i < mx; i++) { if (i) s += ","; s += J(arr[i]); }
    return s + "]";
}

} // namespace __cs

#define _CSV(nm, val, ln, fn) __cs::emit("var", #nm, __cs::J(val), ln, fn)
#define _CSA(nm, arr, ln, fn) __cs::emit("arr", #nm, __cs::JA(arr), ln, fn)
#define _CSN(nm, val, ln, fn) __cs::emit("ans", #nm, __cs::J(val), ln, fn)
#define _CSF(nm, ln)          __cs::emit("call", nm, "null", ln, nm)

// ============================================================

"""

ANS_NAMES = {'ans', 'answer', 'result', 'res', 'ret', 'output'}
BAD_NAMES = {
    'if', 'while', 'for', 'return', 'else', 'cout', 'cin',
    'int', 'long', 'double', 'float', 'bool', 'char', 'auto',
    'void', 'string', 'size_t', 'true', 'false', 'null',
    'max', 'min', 'abs', 'swap', 'sort', 'endl',
}
FN_DEF_TYPES = r'(?:int|long\s*long|ll|lli|double|void|bool|auto|string|char|size_t|int64_t|int32_t)'
FN_DEF_RE = re.compile(rf'^\s*(?:{FN_DEF_TYPES})\s+([a-zA-Z_]\w*)\s*\([^)]*\)\s*(?:const\s*)?\{{')


def instrument(source: str) -> tuple[str, list]:
    """
    Full instrumentation pipeline:
      1. Preprocess (strip #define int long long, collect aliases)
      2. Strip existing std includes
      3. Pass 1: inject after declarations and scalar assignments
      4. Pass 2: inject array snapshots after subscript writes
    """
    # Step 1: preprocess
    prep = preprocess(source)
    src = prep.source

    # Step 2: strip existing standard includes
    src = re.sub(
        r'^\s*#include\s*<(bits/stdc\+\+|iostream|vector|algorithm|queue|map|set|'
        r'string|cstring|climits|cmath|numeric|utility|tuple|array|stack|deque|'
        r'unordered_map|unordered_set|functional|cassert|cstdio|cstdlib|'
        r'sstream|iomanip|bitset|complex)\.h?>\s*$',
        '', src, flags=re.MULTILINE
    )

    # Build dynamic patterns from preprocessor output
    scalar_pat = build_scalar_pattern(prep.type_aliases)
    container_pat = build_container_pattern(prep.container_aliases)

    SCALAR_DECL = re.compile(
        rf'^\s*({scalar_pat})\s+([a-zA-Z_]\w*)\s*=\s*(.+?)\s*;'
    )
    VEC_DECL = re.compile(
        rf'^\s*({container_pat})\s+([a-zA-Z_]\w*)'
    )
    RAW_ARR = re.compile(
        rf'^\s*(?:{scalar_pat})\s+([a-zA-Z_]\w*)\s*\['
    )
    ASSIGN = re.compile(r'^\s*([a-zA-Z_]\w*)\s*=\s*(.+?)\s*;')
    COMPOUND = re.compile(r'^\s*([a-zA-Z_]\w*)\s*(\+=|-=|\*=|/=|%=|&=|\|=)\s*(.+?)\s*;')
    ARR_WRITE = re.compile(r'^\s*([a-zA-Z_]\w*)\s*\[')

    lines = src.split('\n')
    out = []
    annotations = []
    fn_stack = ['main']
    declared_scalars = set()
    declared_arrays = set()

    def cur_fn(): return fn_stack[-1] if fn_stack else 'main'

    def inj(name, lineno, indent):
        fn = cur_fn()
        if name in ANS_NAMES:
            return f'{indent}_CSN({name}, {name}, {lineno}, "{fn}");'
        return f'{indent}_CSV({name}, {name}, {lineno}, "{fn}");'

    def inj_arr(name, lineno, indent):
        return f'{indent}_CSA({name}, {name}, {lineno}, "{cur_fn()}");'

    for lineno, line in enumerate(lines, 1):
        stripped = line.strip()
        indent = ' ' * (len(line) - len(line.lstrip()))

        skip = (
            not stripped
            or stripped.startswith('//')
            or stripped.startswith('#')
            or stripped.startswith('/*')
            or stripped.startswith('*')
            or stripped.startswith('_CS')
            or stripped.startswith('namespace __cs')
        )
        if skip:
            out.append(line)
            continue

        # Track function entry
        fn_m = FN_DEF_RE.match(line)
        if fn_m:
            fname = fn_m.group(1)
            if fname not in BAD_NAMES:
                fn_stack.append(fname)
                out.append(line)
                out.append(f'{indent}    _CSF("{fname}", {lineno});')
                annotations.append({'line': lineno, 'type': 'fn_entry', 'name': fname})
                continue

        # Container declarations (vector<int> dp(n, 0); etc.)
        vec_m = VEC_DECL.match(line)
        if vec_m and ';' in line:
            vname = vec_m.group(2) if vec_m.lastindex >= 2 else vec_m.group(1)
            # group(1) is the type, group(2) is the name
            # But pattern varies — let's extract by finding the name after the type
            # Re-extract: match type then name
            vname = _extract_container_name(line, container_pat)
            if vname and vname not in BAD_NAMES:
                declared_arrays.add(vname)
                out.append(line)
                out.append(inj_arr(vname, lineno, indent))
                annotations.append({'line': lineno, 'type': 'arr_decl', 'name': vname})
                continue

        # Raw C arrays: int arr[N];
        raw_m = RAW_ARR.match(line)
        if raw_m and ';' in line and '=' not in line.split('[')[0]:
            vname = raw_m.group(1)
            if vname not in BAD_NAMES:
                declared_arrays.add(vname)
                out.append(line)
                annotations.append({'line': lineno, 'type': 'raw_arr', 'name': vname})
                continue

        # Scalar declarations with initializer
        sdecl_m = SCALAR_DECL.match(line)
        if sdecl_m and ';' in line:
            vname = sdecl_m.group(2)
            if vname not in BAD_NAMES and '[' not in vname:
                declared_scalars.add(vname)
                out.append(line)
                out.append(inj(vname, lineno, indent))
                annotations.append({'line': lineno, 'type': 'var_decl', 'name': vname})
                continue

        # Compound assignments
        comp_m = COMPOUND.match(line)
        if comp_m and ';' in line:
            vname = comp_m.group(1)
            lhs = line[:line.index(comp_m.group(2))]
            if vname not in BAD_NAMES and '[' not in lhs:
                out.append(line)
                if vname in declared_arrays:
                    out.append(inj_arr(vname, lineno, indent))
                elif vname in declared_scalars or vname in ANS_NAMES:
                    out.append(inj(vname, lineno, indent))
                annotations.append({'line': lineno, 'type': 'compound', 'name': vname})
                continue

        # Simple assignments
        asgn_m = ASSIGN.match(line)
        if asgn_m and ';' in line:
            vname = asgn_m.group(1)
            lhs = line[:line.index('=')]
            if vname not in BAD_NAMES and '[' not in lhs:
                out.append(line)
                if vname in declared_arrays:
                    out.append(inj_arr(vname, lineno, indent))
                else:
                    declared_scalars.add(vname)
                    out.append(inj(vname, lineno, indent))
                annotations.append({'line': lineno, 'type': 'assign', 'name': vname})
                continue

        out.append(line)

    # Pass 2: inject array snapshots after subscript writes
    out2 = []
    for lineno, line in enumerate(out, 1):
        out2.append(line)
        stripped = line.strip()
        if stripped.startswith('_CS') or stripped.startswith('//') or stripped.startswith('#'):
            continue
        arr_m = ARR_WRITE.match(line)
        if arr_m and ';' in line:
            aname = arr_m.group(1)
            bracket_pos = line.index('[')
            rest = line[bracket_pos:]
            if re.search(r'\]\s*(?:\+|-|\*|/|%|&|\||\^|<<|>>)?=\s*', rest) and aname in declared_arrays:
                indent = ' ' * (len(line) - len(line.lstrip()))
                out2.append(f'{indent}_CSA({aname}, {aname}, {lineno}, "");')

    result = TRACE_HEADER + '\n'.join(out2)
    return result, annotations


def _extract_container_name(line: str, container_pat: str) -> str:
    """Extract variable name from a container declaration line."""
    m = re.match(rf'^\s*(?:{container_pat})\s+([a-zA-Z_]\w*)', line)
    if m:
        return m.group(m.lastindex)
    return ''


# Backward compat aliases
def instrument_v2(source: str) -> tuple[str, list]:
    return instrument(source)

def instrument_full(source: str) -> tuple[str, list]:
    return instrument(source)


def detect_algorithm(source: str) -> dict:
    src = source.lower()
    clues = {
        'dijkstra':   ['dist[', 'priority_queue', 'dijkstra', 'pq.push', 'relax'],
        'bfs':        ['queue', 'bfs(', 'visited[', '.front()', '.pop()'],
        'dfs':        ['dfs(', 'visited[', 'stack<'],
        'dp_1d':      ['dp[i]', 'dp[j]', 'dp[i-1]', 'lis', 'knapsack', 'memo['],
        'dp_2d':      ['dp[i][j]', 'dp[i-1][j', 'lcs', 'edit'],
        'graph':      ['adj[', 'addedge', 'graph['],
        'array_ops':  ['sort(', 'prefix[', 'suffix[', 'two pointer', 'sliding'],
        'tree':       ['left[', 'right[', 'parent[', 'build(', 'query(', 'update('],
    }
    scores = {k: sum(1 for kw in kws if kw in src) for k, kws in clues.items()}
    scores = {k: v for k, v in scores.items() if v > 0}
    if not scores:
        return {'type': 'generic', 'algorithm': None, 'confidence': 0}
    best = max(scores, key=scores.get)
    viz = ('graph' if best in ('dijkstra', 'bfs', 'dfs', 'graph')
           else 'dp_table_2d' if best == 'dp_2d'
           else 'dp_table_1d' if best == 'dp_1d'
           else 'tree' if best == 'tree'
           else 'array')
    return {'type': viz, 'algorithm': best, 'confidence': scores[best], 'all_scores': scores}
