'use strict';

// Live Markdown styling for CodeMirror 6.
//
// Three layers:
//   1. HighlightStyle  — headings grow, bold/italic/code/quote/link get real styling.
//   2. conceal plugin  — formatting marks (#, *, _, `, >) are hidden EXCEPT on the
//                        line the cursor is on, so editing still works (the Bear /
//                        Obsidian "live preview" feel).
//   3. match plugins   — our own #tags and [[wikilinks]] get colored.

import { Decoration, ViewPlugin, MatchDecorator, WidgetType, EditorView } from '@codemirror/view';
import { syntaxTree, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { RangeSetBuilder, StateField } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import { marked } from 'marked';

// 1. token styling ---------------------------------------------------------

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.9em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.5em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading3, fontSize: '1.25em', fontWeight: '600' },
  { tag: tags.heading4, fontSize: '1.1em', fontWeight: '600' },
  { tag: tags.heading5, fontWeight: '600' },
  { tag: tags.heading6, fontWeight: '600', color: 'var(--text-dim)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  {
    tag: tags.monospace,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.9em',
    background: 'var(--code-bg)',
    padding: '1px 5px',
    borderRadius: '5px',
  },
  { tag: tags.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--text-dim)' },
  { tag: tags.quote, color: 'var(--text-dim)', fontStyle: 'italic' },
  { tag: tags.atom, color: 'var(--accent)', fontWeight: '600' },
  { tag: tags.content, color: 'var(--text)' },
  { tag: tags.processingInstruction, color: 'var(--accent)' },
  { tag: tags.contentSeparator, color: 'var(--text-dim)' },
]);

// 2. conceal formatting marks & live block widgets -------------------------

class TableWidget extends WidgetType {
  constructor(html, from) {
    super();
    this.html = html;
    this.from = from;
  }
  eq(other) {
    return this.html === other.html && this.from === other.from;
  }
  toDOM(view) {
    const wrap = document.createElement('div');
    wrap.className = 'nw-live-table-wrap';
    wrap.innerHTML = this.html;
    wrap.title = 'Click to edit table';
    wrap.addEventListener('click', () => {
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
      view.focus();
    });
    return wrap;
  }
}

class HrWidget extends WidgetType {
  constructor(from) {
    super();
    this.from = from;
  }
  eq(other) {
    return this.from === other.from;
  }
  toDOM(view) {
    const hr = document.createElement('hr');
    hr.className = 'nw-live-hr';
    hr.addEventListener('click', () => {
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
      view.focus();
    });
    return hr;
  }
}

const CONCEAL = new Set([
  'HeaderMark', 'EmphasisMark', 'CodeMark', 'StrikethroughMark', 'QuoteMark',
]);
const hidden = Decoration.replace({});

function buildConceal(view) {
  const builder = new RangeSetBuilder();
  const sel = view.state.selection.main;
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter: (node) => {
        if (!CONCEAL.has(node.name)) return;
        const line = doc.lineAt(node.from);
        const cursorOnLine = sel.from <= line.to && sel.to >= line.from;
        if (cursorOnLine) return; // reveal marks while editing this line
        let end = node.to;
        // also swallow the space after a heading's "#" run
        if (node.name === 'HeaderMark' && doc.sliceString(node.to, node.to + 1) === ' ') {
          end = node.to + 1;
        }
        if (end > node.from) builder.add(node.from, end, hidden);
      },
    });
  }
  return builder.finish();
}

const concealPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = buildConceal(view); }
    update(u) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildConceal(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function buildBlocks(state) {
  const builder = new RangeSetBuilder();
  const sel = state.selection.main;
  const doc = state.doc;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === 'Table') {
        const from = doc.lineAt(node.from).from;
        const to = doc.lineAt(node.to).to;
        const cursorInTable = sel.from <= to && sel.to >= from;
        if (!cursorInTable) {
          const raw = doc.sliceString(from, to);
          const html = marked.parse(raw);
          builder.add(from, to, Decoration.replace({
            widget: new TableWidget(html, from),
            block: true,
          }));
        } else {
          let pos = from;
          while (pos <= to) {
            const line = doc.lineAt(pos);
            builder.add(line.from, line.from, Decoration.line({ class: 'nw-table-line' }));
            pos = line.to + 1;
          }
        }
        return false;
      }

      if (node.name === 'HorizontalRule') {
        const line = doc.lineAt(node.from);
        const cursorOnLine = sel.from <= line.to && sel.to >= line.from;
        if (!cursorOnLine) {
          builder.add(line.from, line.to, Decoration.replace({
            widget: new HrWidget(line.from),
            block: true,
          }));
        }
        return false;
      }
    },
  });
  return builder.finish();
}

const blockField = StateField.define({
  create(state) {
    return buildBlocks(state);
  },
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) {
      return buildBlocks(tr.state);
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 3. our own #tags and [[wikilinks]] --------------------------------------

function matcher(regexp, cls) {
  const deco = new MatchDecorator({ regexp, decoration: Decoration.mark({ class: cls }) });
  return ViewPlugin.define(
    (view) => ({
      decorations: deco.createDeco(view),
      update(u) { this.decorations = deco.updateDeco(u, this.decorations); },
    }),
    { decorations: (v) => v.decorations },
  );
}

const tagPlugin = matcher(/(?<=^|\s)#[A-Za-z0-9_][A-Za-z0-9_/-]*/g, 'nw-tag');
const wikiPlugin = matcher(/\[\[[^\]\n]+\]\]/g, 'nw-wikilink');

export const liveMarkdown = [
  syntaxHighlighting(mdHighlight),
  blockField,
  concealPlugin,
  tagPlugin,
  wikiPlugin,
];
