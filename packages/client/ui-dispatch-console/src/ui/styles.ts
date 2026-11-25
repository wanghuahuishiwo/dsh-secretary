/** Module tokens (`--dc-*`): defined once, light and dark via the `data-dc-theme` attribute. */
const variables = `
.dc, .dc-notice {
  --dc-bg: #ffffff;
  --dc-surface: #f5f6f7;
  --dc-border: #e3e5e8;
  --dc-text: #1c1f23;
  --dc-muted: #6b7280;
  --dc-accent: #2f6fed;
  --dc-ok: #2e9e5b;
  --dc-warn: #d98a0b;
  --dc-error: #d64545;
  --dc-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  box-sizing: border-box;
  font-size: 13px;
  line-height: 20px;
  color: var(--dc-text);
}
.dc[data-dc-theme='dark'], .dc-notice[data-dc-theme='dark'] {
  --dc-bg: #16181c;
  --dc-surface: #1f2227;
  --dc-border: #2c3036;
  --dc-text: #e6e8eb;
  --dc-muted: #9aa1ab;
  --dc-accent: #6f9cf5;
  --dc-ok: #4cc27a;
  --dc-warn: #e3a52d;
  --dc-error: #ef6b6b;
}
.dc * { box-sizing: border-box; }`

/** The full-page console shell and its sections. */
export const consoleTokens = `${variables}
.dc {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--dc-bg);
}
.dc-header { display: flex; align-items: center; gap: 16px; padding: 8px 16px; border-bottom: 1px solid var(--dc-border); font-variant-numeric: tabular-nums; flex: none; }
.dc-header strong { font-weight: 600; }
.dc-body { flex: 1 1 auto; min-height: 0; display: flex; }
.dc-nav { width: 160px; flex: none; border-right: 1px solid var(--dc-border); padding: 8px; display: flex; flex-direction: column; gap: 2px; }
.dc-nav button { text-align: left; padding: 6px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--dc-text); font: inherit; cursor: pointer; }
.dc-nav button:hover { background: var(--dc-surface); }
.dc-nav button[aria-current='page'] { background: var(--dc-surface); color: var(--dc-accent); font-weight: 600; }
.dc-content { flex: 1 1 auto; min-width: 0; overflow: auto; padding: 16px 20px; }
.dc-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dc-muted { color: var(--dc-muted); }
.dc-placeholder { color: var(--dc-muted); }
.dc-mono { font-family: var(--dc-mono); font-size: 12px; }
.dc-tone-ok { color: var(--dc-ok); }
.dc-tone-warning { color: var(--dc-warn); }
.dc-tone-error { color: var(--dc-error); }
.dc-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--dc-border); margin-bottom: 12px; }
.dc-tabs button { border: 0; background: transparent; color: var(--dc-muted); font: inherit; padding: 6px 10px; cursor: pointer; border-bottom: 2px solid transparent; }
.dc-tabs button[aria-selected='true'] { color: var(--dc-text); border-bottom-color: var(--dc-accent); }
.dc-actions { display: flex; gap: 8px; margin: 12px 0; }
.dc-log { margin: 0; padding: 8px 10px; max-height: 240px; overflow: auto; background: var(--dc-surface); border: 1px solid var(--dc-border); border-radius: 6px; white-space: pre-wrap; word-break: break-all; font-family: var(--dc-mono); font-size: 12px; }
.dc-table { border-collapse: collapse; }
.dc-table td { padding: 4px 12px 4px 0; vertical-align: top; }
.dc-table td:first-child { color: var(--dc-muted); white-space: nowrap; }
.dc-field { display: grid; grid-template-columns: 140px 1fr; gap: 8px; align-items: center; margin-bottom: 8px; max-width: 560px; }
.dc-field label { color: var(--dc-muted); }
.dc-grid { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
.dc-grid th { text-align: left; font-weight: 600; padding: 4px 12px 4px 0; border-bottom: 1px solid var(--dc-border); white-space: nowrap; color: var(--dc-muted); }
.dc-grid td { padding: 4px 12px 4px 0; vertical-align: top; border-bottom: 1px solid var(--dc-border); }
.dc-grid button { border: 0; background: transparent; color: var(--dc-accent); font: inherit; padding: 0 4px; cursor: pointer; }
.dc-cell-json { white-space: pre-wrap; word-break: break-all; max-width: 480px; }
.dc-json { margin: 0; white-space: pre-wrap; word-break: break-all; font-family: var(--dc-mono); font-size: 12px; }
.dc-events { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.dc-events-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.dc-events-table tbody tr { cursor: pointer; }
.dc-events-table tbody tr:hover { background: var(--dc-surface); }
.dc-new { align-self: flex-start; margin-bottom: 8px; font: inherit; padding: 4px 10px; border: 1px solid var(--dc-accent); border-radius: 6px; background: var(--dc-bg); color: var(--dc-accent); cursor: pointer; }
.dc-event-detail button { font: inherit; padding: 4px 10px; border: 1px solid var(--dc-border); border-radius: 6px; background: var(--dc-bg); color: var(--dc-text); cursor: pointer; }
.dc-event-detail pre + pre { margin-top: 12px; }
.dc-field input { font: inherit; padding: 4px 8px; border: 1px solid var(--dc-border); border-radius: 6px; background: var(--dc-bg); color: var(--dc-text); }
`

/** The `shell.overlay` notice lives outside the console root, so it carries the tokens itself. */
export const noticeTokens = `${variables}
.dc-notice { pointer-events: auto; display: inline-flex; align-items: center; gap: 8px; margin: 8px; padding: 6px 12px; border-radius: 8px; background: var(--dc-surface); border: 1px solid var(--dc-error); }
.dc-notice button { font: inherit; color: var(--dc-accent); background: transparent; border: 0; padding: 0; cursor: pointer; }
`
