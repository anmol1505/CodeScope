"""
CodeScope Preprocessor
-----------------------
Handles common competitive programming patterns BEFORE instrumentation:
  1. #define int long long  (remap type keywords)
  2. #define ll long long
  3. #define vi vector<int>
  4. #define pb push_back
  5. using namespace std; (ensure present)
  6. Fast I/O macros (ios_base::sync_with_stdio etc.) - strip them
  7. Common typedef patterns

Also extracts user-defined #defines so the instrumentation regex
knows what types to track.
"""

import re
from dataclasses import dataclass, field


@dataclass 
class PreprocessResult:
    source: str                      # cleaned source ready for instrumentation
    type_aliases: dict = field(default_factory=dict)   # e.g. {'ll': 'long long', 'int': 'long long'}
    container_aliases: dict = field(default_factory=dict)  # e.g. {'vi': 'vector<int>'}
    ans_names: set = field(default_factory=set)         # additional answer var names from macros


# Types the instrumentor should track (scalar)
BASE_SCALAR_TYPES = {
    'int', 'long long', 'long', 'double', 'float', 'bool', 'char', 'auto',
    'unsigned int', 'unsigned long long', 'size_t', 'int64_t', 'int32_t',
}

# Types that map to containers
BASE_CONTAINER_TYPES = {
    'vector', 'array', 'deque', 'list',
}


def preprocess(source: str) -> PreprocessResult:
    """
    Clean and normalize C++ source for instrumentation.
    Returns the cleaned source plus metadata about what was found.
    """
    result = PreprocessResult(source=source)
    lines = source.split('\n')
    out_lines = []

    type_aliases = {}       # alias -> resolved_type
    container_aliases = {}  # alias -> container_expr

    # First pass: collect #define and typedef info
    define_re = re.compile(r'^\s*#define\s+(\w+)\s+(.+?)\s*$')
    typedef_re = re.compile(r'^\s*typedef\s+(.+?)\s+(\w+)\s*;')
    using_alias_re = re.compile(r'^\s*using\s+(\w+)\s*=\s*(.+?)\s*;')

    for line in lines:
        # #define
        m = define_re.match(line)
        if m:
            alias, expansion = m.group(1), m.group(2).strip()
            # Scalar type alias: #define ll long long
            if expansion in BASE_SCALAR_TYPES or any(expansion.startswith(t) for t in BASE_SCALAR_TYPES):
                type_aliases[alias] = expansion
            # Container alias: #define vi vector<int>
            elif any(expansion.startswith(c) for c in BASE_CONTAINER_TYPES):
                container_aliases[alias] = expansion
            # #define int long long - special case (renames builtin)
            if alias == 'int' and 'long long' in expansion:
                type_aliases['int'] = 'long long'
                type_aliases['ll'] = 'long long'

        # typedef long long ll;
        m = typedef_re.match(line)
        if m:
            base_type, alias = m.group(1).strip(), m.group(2).strip()
            if any(base_type.startswith(t) for t in BASE_SCALAR_TYPES):
                type_aliases[alias] = base_type
            elif any(base_type.startswith(c) for c in BASE_CONTAINER_TYPES):
                container_aliases[alias] = base_type

        # using ll = long long;
        m = using_alias_re.match(line)
        if m:
            alias, base_type = m.group(1).strip(), m.group(2).strip()
            if any(base_type.startswith(t) for t in BASE_SCALAR_TYPES):
                type_aliases[alias] = base_type

    result.type_aliases = type_aliases
    result.container_aliases = container_aliases

    # Second pass: transform source
    # Key transformation: if `#define int long long` is present,
    # we need to remove that define AND make our trace macros use long long.
    # Our TRACE_HEADER already uses templates so it's fine — but we must
    # NOT let `#define int long long` expand our `int __step` in the header.
    # Solution: add `#undef int` at the very top of user code if present.

    has_int_redef = 'int' in type_aliases and 'long long' in type_aliases.get('int','')

    for i, line in enumerate(lines):
        stripped = line.strip()

        # Remove #define int long long (causes chaos with our injected ints)
        if stripped.startswith('#define') and 'int' in stripped and 'long long' in stripped:
            # Replace with typedef so ll still works
            out_lines.append('// [CodeScope] #define int long long removed - using typedef instead')
            out_lines.append('typedef long long ll;')
            continue

        # Remove fast I/O macros that could interfere (we don't need them for tracing)
        if stripped.startswith('#define') and any(x in stripped for x in [
            'sync_with_stdio', 'cin.tie', 'cout.tie', 'endl', 'pb push_back',
            'mp make_pair', 'fi first', 'se second',
        ]):
            out_lines.append(f'// [CodeScope] macro: {stripped}')
            continue

        out_lines.append(line)

    result.source = '\n'.join(out_lines)
    return result


def build_scalar_pattern(type_aliases: dict) -> str:
    """
    Build a regex pattern that matches all scalar type declarations,
    including user-defined aliases like 'll', 'lli', etc.
    """
    all_types = set(BASE_SCALAR_TYPES)
    for alias, resolved in type_aliases.items():
        if alias != 'int':  # 'int' is already in BASE_SCALAR_TYPES
            all_types.add(alias)

    # Sort by length descending so longer names match first (e.g. 'long long' before 'long')
    sorted_types = sorted(all_types, key=len, reverse=True)

    # Escape and join
    escaped = [re.escape(t) for t in sorted_types]
    return '(?:' + '|'.join(escaped) + ')'


def build_container_pattern(container_aliases: dict) -> str:
    """Build pattern matching vector<>, array<>, and user aliases."""
    base = r'(?:vector\s*<[^>]+>|array\s*<[^>]+>|deque\s*<[^>]+>)'
    if container_aliases:
        aliases = sorted(container_aliases.keys(), key=len, reverse=True)
        alias_pat = '|'.join(re.escape(a) for a in aliases)
        return f'(?:{base}|{alias_pat})'
    return base
