import { useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, keymap, Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { StateField, StateEffect } from '@codemirror/state';

// ── Highlight effect ────────────────────────────────────────────
const setHighlight = StateEffect.define();

const highlightField = StateField.define({
  create() { return Decoration.none; },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setHighlight)) {
        if (e.value === null) {
          deco = Decoration.none;
        } else {
          deco = Decoration.set([
            Decoration.line({ class: 'cm-exec-line' }).range(e.value)
          ]);
        }
      }
    }
    return deco;
  },
  provide: f => EditorView.decorations.from(f),
});

export default function CodeEditor({ code, onChange, highlightLine, isRunning }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    });

    const theme = EditorView.theme({
      '&': { background: 'transparent', height: '100%', fontSize: '13px' },
      '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.7', overflow: 'auto' },
      '.cm-content': { padding: '8px 0', caretColor: '#5b8af5' },
      '.cm-line': { padding: '0 16px 0 6px' },
      '.cm-gutters': { background: 'transparent', border: 'none', color: '#555870', minWidth: '44px' },
      '.cm-gutterElement': { padding: '0 8px 0 4px', textAlign: 'right' },
      '.cm-activeLineGutter': { background: 'rgba(91,138,245,0.06)', color: '#8b8fa8' },
      '.cm-activeLine': { background: 'rgba(91,138,245,0.04)' },
      '.cm-cursor': { borderLeftColor: '#5b8af5', borderLeftWidth: '2px' },
      '.cm-selectionBackground, ::selection': { background: 'rgba(91,138,245,0.2) !important' },
      // Execution highlight
      '.cm-exec-line': {
        background: 'rgba(61, 214, 140, 0.12) !important',
        borderLeft: '2px solid #3dd68c',
        paddingLeft: '4px !important',
      },
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: code || '',
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          indentOnInput(),
          cpp(),
          oneDark,
          theme,
          highlightField,
          updateListener,
          keymap.of(defaultKeymap),
          EditorView.lineWrapping,
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => view.destroy();
  }, []);

  // Sync code changes from outside (demo load)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== code && code !== undefined) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
    }
  }, [code]);

  // Sync execution line highlight
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (!highlightLine || highlightLine <= 0) {
      view.dispatch({ effects: setHighlight.of(null) });
      return;
    }

    try {
      const lineCount = view.state.doc.lines;
      if (highlightLine > lineCount) return;
      const line = view.state.doc.line(highlightLine);
      view.dispatch({
        effects: [
          setHighlight.of(line.from),
          EditorView.scrollIntoView(line.from, { y: 'center' }),
        ],
      });
    } catch (_) {}
  }, [highlightLine]);

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        overflow: 'hidden',
        opacity: isRunning ? 0.55 : 1,
        transition: 'opacity 0.2s',
      }}
    />
  );
}
