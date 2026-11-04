/**
 * Styling for the 事项 (GTD) view only: the product shell ships its own stylesheet
 * (productStyles.ts) and this one keeps the GTD canvas readable inside it.
 * Tokens come from the host, so light and dark follow DSH.
 */
export const gtdStyles = `
.secretary-time-panel {
  position: relative;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--dsw-alias-bg);
  color: var(--dsw-alias-text);
  font-family: var(--dsw-alias-font);
  font-size: 14px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;

  --dsw-alias-bg: var(--dsw-alias-bg-base, #f5f5f7);
  --dsw-alias-surface: var(--dsw-alias-bg-layer-1, #ffffff);
  --dsw-alias-surface-raised: var(--dsw-alias-bg-layer-1, #ffffff);
  --dsw-alias-surface-subtle: var(--dsw-alias-bg-module-platform, #ececf0);
  --dsw-alias-surface-hover: var(--dsw-alias-interactive-bg-hover, #e4e4e9);
  --dsw-alias-text: var(--dsw-alias-label-primary, #1d1d1f);
  --dsw-alias-text-secondary: var(--dsw-alias-label-secondary, #54545b);
  --dsw-alias-muted: var(--dsw-alias-label-secondary, #797981);
  --dsw-alias-border: var(--dsw-alias-border-l3, rgba(29, 29, 31, 0.12));
  --dsw-alias-border-soft: var(--dsw-alias-border-l2, rgba(29, 29, 31, 0.07));
  --dsw-alias-accent: var(--dsw-alias-link, #3972d8);
  --dsw-alias-accent-soft: var(--dsw-alias-interactive-bg-hover-accent, rgba(57, 114, 216, 0.12));
  --dsw-alias-on-accent: var(--dsw-alias-label-primary-inverted, #ffffff);
  --dsw-alias-fill-strong: var(--dsw-alias-button-primary-fill, #1d1d1f);
  --dsw-alias-on-strong: var(--dsw-alias-label-primary-inverted, #ffffff);
  --dsw-alias-danger: var(--dsw-alias-state-error-primary, #bd443d);
  --dsw-alias-danger-soft: var(--dsw-alias-interactive-bg-hover-danger, rgba(189, 68, 61, 0.1));
  --dsw-alias-warn: var(--dsw-alias-state-warn-primary, #ad7927);
  --dsw-alias-warn-soft: var(--dsw-alias-state-warn-tertiary, rgba(173, 121, 39, 0.14));
  --dsw-alias-high: var(--dsw-static-green-500, #317b68);
  --dsw-alias-high-soft: rgba(49, 123, 104, 0.16);
  --dsw-alias-medium: var(--dsw-static-amber-500, #ad7927);
  --dsw-alias-medium-soft: rgba(173, 121, 39, 0.16);
  --dsw-alias-low: var(--dsw-static-deepseek-400, #806a96);
  --dsw-alias-low-soft: rgba(128, 106, 150, 0.16);
  --dsw-alias-on-tag: #ffffff;
  --dsw-alias-shadow: 0 12px 36px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
  --dsw-alias-focus: 0 0 0 3px var(--dsw-alias-accent-soft);
  --dsw-alias-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif;
  --dsw-alias-font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Segoe UI", sans-serif;
  --dsw-alias-font-mono: ui-monospace, "SF Mono", Menlo, monospace;
  --dsw-alias-radius-small: 6px;
  --dsw-alias-radius: 9px;
  --dsw-alias-radius-large: 12px;
  --dsw-alias-row-height: 40px;
  --dsw-alias-hour-width: 44px;
  --dsw-alias-motion: 140ms;
}
.secretary-time-panel *, .secretary-time-panel *::before, .secretary-time-panel *::after { box-sizing: border-box; }
.secretary-time-panel button, .secretary-time-panel input, .secretary-time-panel textarea, .secretary-time-panel select { font: inherit; color: inherit; }
.secretary-time-panel button { cursor: pointer; }
.secretary-time-panel button, .secretary-time-panel input, .secretary-time-panel textarea { -webkit-tap-highlight-color: transparent; }
.secretary-time-panel :focus-visible { outline: none; box-shadow: var(--dsw-alias-focus); }
.secretary-time-panel [hidden] { display: none !important; }
.secretary-time-panel .svg-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
.secretary-time-panel .icon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.secretary-time-panel .icon-button, .secretary-time-panel .quiet-button, .secretary-time-panel .danger-button { min-width: 30px; min-height: 30px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid transparent; border-radius: var(--dsw-alias-radius-small); background: transparent; color: var(--dsw-alias-muted); padding: 4px 7px; font-size: 11px; font-weight: 600; }
.secretary-time-panel .icon-button { padding: 4px; }
.secretary-time-panel .icon-button:hover, .secretary-time-panel .quiet-button:hover { background: var(--dsw-alias-surface-subtle); color: var(--dsw-alias-text); }
.secretary-time-panel .tag-dot { width: 9px; height: 9px; flex: none; border-radius: 3px; background: var(--tag-color); }
.secretary-time-panel .empty-note { padding: 12px 6px; color: var(--dsw-alias-muted); font-size: 11px; }
/* GTD workspace keeps the shared shell while its own screen is not designed yet. */
.secretary-time-panel .gtd-workspace { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.secretary-time-panel .gtd-tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 7px 14px; border-bottom: 1px solid var(--dsw-alias-border-soft); background: var(--dsw-alias-surface); }
.secretary-time-panel .gtd-tabs button, .secretary-time-panel .gtd-section button { border: 1px solid var(--dsw-alias-border); border-radius: var(--dsw-alias-radius-small); background: var(--dsw-alias-surface); color: inherit; padding: 5px 8px; cursor: pointer; font-size: 11px; }
.secretary-time-panel .gtd-tabs button[aria-selected="true"] { background: var(--dsw-alias-accent-soft); border-color: var(--dsw-alias-accent); color: var(--dsw-alias-accent); }
.secretary-time-panel .gtd-section { max-width: 980px; margin: 0 auto; padding: 14px; }
.secretary-time-panel .gtd-section-title { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.secretary-time-panel .gtd-section-title > span, .secretary-time-panel .gtd-forecast-note { color: var(--dsw-alias-muted); font-size: 11px; }
.secretary-time-panel .gtd-section-title > div { display: flex; flex-wrap: wrap; gap: 5px; }
.secretary-time-panel .gtd-capture-form, .secretary-time-panel .gtd-clarify-form { display: flex; flex-direction: column; align-items: stretch; gap: 9px; margin-bottom: 14px; }
.secretary-time-panel .gtd-section label, .secretary-time-panel .gtd-field-label { display: flex; flex-direction: column; gap: 4px; color: var(--dsw-alias-muted); font-size: 11px; }
.secretary-time-panel .gtd-section input:not([type="checkbox"]), .secretary-time-panel .gtd-section select, .secretary-time-panel .gtd-section textarea { width: 100%; min-width: 0; border: 1px solid var(--dsw-alias-border); border-radius: var(--dsw-alias-radius-small); background: var(--dsw-alias-surface); color: inherit; padding: 6px; }
.secretary-time-panel .gtd-capture-form button, .secretary-time-panel .gtd-clarify-form > button { align-self: flex-start; }
.secretary-time-panel .gtd-list, .secretary-time-panel .gtd-project > div { display: flex; flex-direction: column; gap: 7px; }
.secretary-time-panel .gtd-inbox-row, .secretary-time-panel .gtd-action-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 9px; border: 1px solid var(--dsw-alias-border-soft); border-radius: var(--dsw-alias-radius); background: var(--dsw-alias-surface); }
.secretary-time-panel .gtd-inbox-row > div { flex: 1; min-width: 180px; }
.secretary-time-panel .gtd-inbox-row p { margin: 4px 0; white-space: pre-wrap; }
.secretary-time-panel .gtd-inbox-row small, .secretary-time-panel .gtd-action-meta, .secretary-time-panel .gtd-project header span { display: block; color: var(--dsw-alias-muted); font-size: 10px; }
.secretary-time-panel .gtd-clarify-form fieldset { min-width: 0; display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--dsw-alias-border-soft); border-radius: var(--dsw-alias-radius); }
.secretary-time-panel .gtd-tag-choices { display: flex; flex-wrap: wrap; gap: 5px 10px; }
.secretary-time-panel .gtd-tag-choices label { flex-direction: row; align-items: center; min-width: 0; }
.secretary-time-panel .gtd-date-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.secretary-time-panel .gtd-project { margin-bottom: 12px; }
.secretary-time-panel .gtd-project > header { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; padding: 8px 0; }
.secretary-time-panel .gtd-project > header > div { flex: 1; min-width: 180px; }
.secretary-time-panel .gtd-project > header p { margin: 4px 0; font-size: 11px; }
.secretary-time-panel .gtd-action-main { flex: 1; min-width: 200px; }
.secretary-time-panel .gtd-action-main strong, .secretary-time-panel .gtd-action-meta { margin-bottom: 3px; }
.secretary-time-panel .gtd-row-actions { display: flex; flex-wrap: wrap; gap: 5px; }
.secretary-time-panel .gtd-section-title label { flex-direction: row; align-items: center; }
body[data-ds-dark-theme] .secretary-time-panel .tag-dot { filter: brightness(1.35) saturate(0.9); }
.secretary-time-panel .shelf-paint .tag-dot { width: 8px; height: 8px; border-radius: 2px; }
`
