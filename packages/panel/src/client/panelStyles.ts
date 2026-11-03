/**
 * Panel stylesheet ported from design/time-tag-prototype.html (variant A) and scoped to
 * `.secretary-time-panel`. Host theme tokens are mapped once in the opening block, so every
 * rule below inherits light/dark from the host instead of defining its own palette.
 */
export const panelStyles = `.secretary-time-panel {
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
.secretary-time-panel .warning-strip { flex: none; display: flex; align-items: center; gap: 7px; padding: 5px 14px; border-bottom: 1px solid var(--dsw-alias-border-soft); background: var(--dsw-alias-warn-soft); color: var(--dsw-alias-warn); font-size: 10px; }
.secretary-time-panel .warning-strip span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.secretary-time-panel .warning-strip button { margin-left: auto; flex: none; border: 0; background: transparent; color: inherit; padding: 2px 4px; font-size: 10px; }

.secretary-time-panel button, .secretary-time-panel input, .secretary-time-panel textarea, .secretary-time-panel select { font: inherit; color: inherit; }
.secretary-time-panel button { cursor: pointer; }
.secretary-time-panel button, .secretary-time-panel input, .secretary-time-panel textarea { -webkit-tap-highlight-color: transparent; }
.secretary-time-panel :focus-visible { outline: none; box-shadow: var(--dsw-alias-focus); }
.secretary-time-panel [hidden] { display: none !important; }
.secretary-time-panel .svg-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
.secretary-time-panel .icon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.secretary-time-panel .topbar { flex: none; display: flex; align-items: center; gap: 16px; min-height: 52px; padding: 7px 14px; background: var(--dsw-alias-surface); border-bottom: 1px solid var(--dsw-alias-border); position: relative; z-index: 30; }
.secretary-time-panel .brand { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-text); white-space: nowrap; }
.secretary-time-panel .brand-mark { width: 24px; height: 24px; border-radius: var(--dsw-alias-radius-small); display: grid; place-items: center; background: var(--dsw-alias-text); color: var(--dsw-alias-surface); }
.secretary-time-panel .brand-name { font-family: var(--dsw-alias-font-display); font-size: 13px; font-weight: 650; }
.secretary-time-panel .module-nav { display: flex; align-items: center; gap: 3px; min-width: 0; }
.secretary-time-panel .nav-button { min-height: 31px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid transparent; border-radius: var(--dsw-alias-radius-small); background: transparent; color: var(--dsw-alias-muted); padding: 4px 9px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.secretary-time-panel .nav-button:hover { background: var(--dsw-alias-surface-subtle); color: var(--dsw-alias-text); }
.secretary-time-panel .nav-button[aria-current="page"] { background: var(--dsw-alias-accent-soft); color: var(--dsw-alias-text); }
.secretary-time-panel .top-actions { margin-left: auto; display: flex; align-items: center; gap: 3px; }
.secretary-time-panel .icon-button, .secretary-time-panel .quiet-button, .secretary-time-panel .danger-button { min-width: 30px; min-height: 30px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid transparent; border-radius: var(--dsw-alias-radius-small); background: transparent; color: var(--dsw-alias-muted); padding: 4px 7px; font-size: 11px; font-weight: 600; }
.secretary-time-panel .icon-button { padding: 4px; }
.secretary-time-panel .icon-button:hover, .secretary-time-panel .quiet-button:hover { background: var(--dsw-alias-surface-subtle); color: var(--dsw-alias-text); }
.secretary-time-panel .danger-button { color: var(--dsw-alias-danger); }
.secretary-time-panel .danger-button:hover { background: var(--dsw-alias-danger-soft); }
.secretary-time-panel .primary-button { min-height: 30px; border: 1px solid var(--dsw-alias-fill-strong); border-radius: var(--dsw-alias-radius-small); background: var(--dsw-alias-fill-strong); color: var(--dsw-alias-on-strong); padding: 4px 10px; font-size: 11px; font-weight: 650; }
.secretary-time-panel .primary-button:hover { filter: brightness(1.05); }
.secretary-time-panel .module-root { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.secretary-time-panel .time-module { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.secretary-time-panel .time-toolbar { flex: none; min-height: 45px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 14px; background: var(--dsw-alias-surface); border-bottom: 1px solid var(--dsw-alias-border-soft); }
.secretary-time-panel .segmented { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid var(--dsw-alias-border-soft); border-radius: var(--dsw-alias-radius); background: var(--dsw-alias-surface-subtle); }
.secretary-time-panel .segmented button { min-height: 26px; border: 1px solid transparent; border-radius: var(--dsw-alias-radius-small); background: transparent; color: var(--dsw-alias-muted); padding: 3px 9px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.secretary-time-panel .segmented button:hover { color: var(--dsw-alias-text); }
.secretary-time-panel .segmented button[aria-selected="true"], .secretary-time-panel .segmented button[aria-pressed="true"] { background: var(--dsw-alias-surface); border-color: var(--dsw-alias-border); color: var(--dsw-alias-text); }
.secretary-time-panel .granularity { display: flex; align-items: center; gap: 7px; color: var(--dsw-alias-muted); font-size: 10px; white-space: nowrap; }
.secretary-time-panel .date-strip { flex: none; display: flex; align-items: center; gap: 10px; min-height: 43px; padding: 5px 14px; border-bottom: 1px solid var(--dsw-alias-border-soft); background: var(--dsw-alias-surface); }
.secretary-time-panel .template-actions { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.secretary-time-panel .week-strip { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; }
.secretary-time-panel .week-day { min-height: 30px; border: 1px solid transparent; border-radius: var(--dsw-alias-radius-small); background: transparent; color: var(--dsw-alias-muted); padding: 3px; font-size: 10px; }
.secretary-time-panel .week-day:hover { background: var(--dsw-alias-surface-subtle); color: var(--dsw-alias-text); }
.secretary-time-panel .week-day[aria-current="date"] { background: var(--dsw-alias-accent-soft); border-color: var(--dsw-alias-accent); color: var(--dsw-alias-accent); }
.secretary-time-panel .repeat-note { color: var(--dsw-alias-muted); font-size: 10px; white-space: nowrap; }
.secretary-time-panel .date-nav { display: flex; align-items: center; gap: 3px; min-width: 0; }
.secretary-time-panel .date-label { border: 0; border-radius: var(--dsw-alias-radius-small); background: var(--dsw-alias-surface); color: var(--dsw-alias-text); padding: 4px 7px; font-size: 12px; font-weight: 620; white-space: nowrap; }
.secretary-time-panel .date-label:hover { background: var(--dsw-alias-surface-subtle); }
.secretary-time-panel .canvas-layout { flex: 1; min-height: 0; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) 282px; overflow: hidden; }
.secretary-time-panel .canvas-panel { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.secretary-time-panel .canvas-status { flex: none; min-height: 35px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 14px; border-bottom: 1px solid var(--dsw-alias-border-soft); color: var(--dsw-alias-muted); font-size: 10px; }
.secretary-time-panel .canvas-status strong { color: var(--dsw-alias-text-secondary); font-weight: 600; }
.secretary-time-panel .brush-current { border: 0; background: transparent; color: var(--dsw-alias-text-secondary); padding: 0; font-size: 10px; font-weight: 650; }
.secretary-time-panel .brush-current:hover { color: var(--dsw-alias-accent); }
.secretary-time-panel .canvas-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-gutter: stable; }
.secretary-time-panel .day-grid { min-width: 0; }
.secretary-time-panel .hour-row { display: grid; grid-template-columns: var(--dsw-alias-hour-width) minmax(0, 1fr); height: var(--dsw-alias-row-height); border-bottom: 1px solid var(--dsw-alias-border-soft); }
.secretary-time-panel .day-grid { border-top: 1px solid var(--dsw-alias-border-soft); }
.secretary-time-panel .hour-label { padding: 5px 7px 0 0; text-align: right; color: var(--dsw-alias-muted); font-family: var(--dsw-alias-font-mono); font-size: 9px; font-variant-numeric: tabular-nums; user-select: none; }
.secretary-time-panel .hour-track { min-width: 0; height: 100%; position: relative; }
.secretary-time-panel .slot-grid { position: absolute; inset: 0; display: grid; z-index: 1; }
.secretary-time-panel .slot { min-width: 0; border: 0; border-right: 1px solid var(--dsw-alias-border-soft); background: transparent; padding: 0; touch-action: pan-y; }
.secretary-time-panel .slot:last-child { border-right: 0; }
.secretary-time-panel .slot:hover { background: var(--dsw-alias-accent-soft); }
.secretary-time-panel .slot.is-selected { background: var(--dsw-alias-accent-soft); box-shadow: inset 0 0 0 1px var(--dsw-alias-accent); }
.secretary-time-panel .record-layer { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.secretary-time-panel .record-fragment { position: absolute; pointer-events: auto; min-width: 0; overflow: hidden; border: 1px solid var(--dsw-alias-bg); border-radius: 3px; background: var(--record-color); color: var(--dsw-alias-on-tag); padding: 2px 4px; text-align: left; touch-action: manipulation; }
.secretary-time-panel .record-fragment:hover { filter: brightness(1.05); }
.secretary-time-panel .record-fragment.is-selected { box-shadow: 0 0 0 2px var(--dsw-alias-accent); z-index: 5; }
.secretary-time-panel .record-name { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 9.5px; font-weight: 600; line-height: 1.15; letter-spacing: 0.01em; }
.secretary-time-panel .record-time { display: block; margin-top: 1px; color: inherit; opacity: 0.7; font-family: var(--dsw-alias-font-mono); font-size: 7.5px; line-height: 1.1; font-variant-numeric: tabular-nums; }
.secretary-time-panel .record-fragment.is-continuation .record-name, .secretary-time-panel .record-fragment.is-continuation .record-time { display: none; }
.secretary-time-panel .record-fragment.is-compact { padding: 1px 2px; }
.secretary-time-panel .record-fragment.is-compact .record-time { display: none; }
.secretary-time-panel .record-fragment.is-micro .record-name { font-size: 8px; }
.secretary-time-panel .tag-shelf { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--dsw-alias-surface); border-left: 1px solid var(--dsw-alias-border); }
.secretary-time-panel .shelf-head { flex: none; padding: 10px 11px 8px; border-bottom: 1px solid var(--dsw-alias-border-soft); }
.secretary-time-panel .shelf-title-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.secretary-time-panel .shelf-title { color: var(--dsw-alias-text); font-size: 12px; font-weight: 650; }
.secretary-time-panel .search-input, .secretary-time-panel .field-input, .secretary-time-panel .field-textarea { width: 100%; border: 1px solid var(--dsw-alias-border); border-radius: var(--dsw-alias-radius-small); background: var(--dsw-alias-bg); color: var(--dsw-alias-text); padding: 6px 8px; font-size: 11px; }
.secretary-time-panel .search-input { margin-top: 8px; }
.secretary-time-panel .search-input::placeholder, .secretary-time-panel .field-input::placeholder, .secretary-time-panel .field-textarea::placeholder { color: var(--dsw-alias-muted); }
.secretary-time-panel .shelf-body { flex: 1; min-height: 0; overflow-y: auto; padding: 6px; }
.secretary-time-panel .tag-choice { width: 100%; min-height: 29px; display: flex; align-items: center; gap: 7px; border: 1px solid transparent; border-radius: var(--dsw-alias-radius-small); background: transparent; color: var(--dsw-alias-text-secondary); padding: 4px 6px 4px calc(6px + var(--depth, 0) * 14px); text-align: left; font-size: 11px; }
.secretary-time-panel .tag-choice:hover { background: var(--dsw-alias-surface-subtle); color: var(--dsw-alias-text); }
.secretary-time-panel .tag-choice.is-brush { background: var(--dsw-alias-accent-soft); color: var(--dsw-alias-text); box-shadow: inset 0 0 0 1px var(--dsw-alias-accent-soft); }
.secretary-time-panel .tag-dot { width: 9px; height: 9px; flex: none; border-radius: 3px; background: var(--tag-color); }
.secretary-time-panel .tag-choice-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.secretary-time-panel .tag-parent-mark { margin-left: auto; color: var(--dsw-alias-muted); font-size: 9px; }
.secretary-time-panel .shelf-foot { flex: none; padding: 8px 11px; border-top: 1px solid var(--dsw-alias-border-soft); color: var(--dsw-alias-muted); font-size: 10px; }
.secretary-time-panel .empty-note { padding: 12px 6px; color: var(--dsw-alias-muted); font-size: 11px; }
.secretary-time-panel .floating { position: fixed; z-index: 80; width: 326px; max-width: calc(100vw - 16px); max-height: min(570px, calc(100dvh - 90px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--dsw-alias-border); border-radius: var(--dsw-alias-radius-large); background: var(--dsw-alias-surface-raised); box-shadow: var(--dsw-alias-shadow); }
.secretary-time-panel .floating-head { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 10px 11px 8px; border-bottom: 1px solid var(--dsw-alias-border-soft); }
.secretary-time-panel .floating-title { color: var(--dsw-alias-text); font-size: 12px; font-weight: 650; }
.secretary-time-panel .floating-subtitle { margin-top: 2px; color: var(--dsw-alias-muted); font-size: 10px; }
.secretary-time-panel .floating-body { flex: 1; min-height: 0; overflow-y: auto; padding: 9px 11px 11px; }
.secretary-time-panel .floating-section { margin-top: 10px; }
.secretary-time-panel .floating-section:first-child { margin-top: 0; }
.secretary-time-panel .field-label { display: block; margin-bottom: 5px; color: var(--dsw-alias-muted); font-size: 10px; font-weight: 600; }
.secretary-time-panel .field-textarea { min-height: 58px; resize: vertical; }
.secretary-time-panel .floating-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--dsw-alias-border-soft); }
.secretary-time-panel .calendar-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; color: var(--dsw-alias-text); font-size: 12px; }
.secretary-time-panel .calendar-weekdays, .secretary-time-panel .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; padding: 0 10px 10px; }
.secretary-time-panel .calendar-weekdays { padding-bottom: 3px; color: var(--dsw-alias-muted); font-size: 9px; text-align: center; }
.secretary-time-panel .calendar-day { min-height: 34px; border: 1px solid transparent; border-radius: var(--dsw-alias-radius-small); background: transparent; color: var(--dsw-alias-text-secondary); padding: 0; font-size: 11px; }
.secretary-time-panel .calendar-day:hover { background: var(--dsw-alias-surface-subtle); color: var(--dsw-alias-text); }
.secretary-time-panel .calendar-day.is-today { border-color: var(--dsw-alias-accent); color: var(--dsw-alias-accent); }
.secretary-time-panel .calendar-day[aria-current="date"] { background: var(--dsw-alias-fill-strong); color: var(--dsw-alias-on-strong); }
.secretary-time-panel .calendar-footer { display: flex; justify-content: center; padding: 0 10px 9px; border-top: 1px solid var(--dsw-alias-border-soft); }
.secretary-time-panel .energy-module { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px 72px; }
.secretary-time-panel .energy-head { max-width: 780px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.secretary-time-panel .energy-title { color: var(--dsw-alias-text); font-size: 13px; font-weight: 650; }
.secretary-time-panel .energy-subtitle { margin-top: 2px; color: var(--dsw-alias-muted); font-size: 10px; }
.secretary-time-panel .brush-picker { flex: none; }
.secretary-time-panel .brush-button { display: inline-flex; align-items: center; gap: 5px; }
.secretary-time-panel .brush-dot { width: 8px; height: 8px; border-radius: 2px; background: currentColor; }
.secretary-time-panel .energy-grid { max-width: 780px; margin: 0 auto; display: grid; grid-template-columns: 42px repeat(7, minmax(0, 1fr)); gap: 2px; user-select: none; }
.secretary-time-panel .energy-day { padding: 0 0 7px; text-align: center; color: var(--dsw-alias-muted); font-size: 10px; font-weight: 600; }
.secretary-time-panel .energy-hour { height: 22px; display: flex; align-items: center; justify-content: flex-end; padding-right: 7px; color: var(--dsw-alias-muted); font-family: var(--dsw-alias-font-mono); font-size: 9px; }
.secretary-time-panel .energy-cell { height: 22px; border: 1px solid var(--dsw-alias-border-soft); border-radius: 4px; background: var(--dsw-alias-surface); padding: 0; touch-action: pan-y; }
.secretary-time-panel .energy-cell:hover { border-color: var(--dsw-alias-accent); }
.secretary-time-panel .energy-cell[data-level="high"] { background: var(--dsw-alias-high); border-color: var(--dsw-alias-high); }
.secretary-time-panel .energy-cell[data-level="medium"] { background: var(--dsw-alias-medium); border-color: var(--dsw-alias-medium); }
.secretary-time-panel .energy-cell[data-level="low"] { background: var(--dsw-alias-low); border-color: var(--dsw-alias-low); }
.secretary-time-panel .energy-legend { max-width: 780px; margin: 12px auto 0; display: flex; flex-wrap: wrap; gap: 12px; color: var(--dsw-alias-muted); font-size: 10px; }
.secretary-time-panel .legend-item { display: inline-flex; align-items: center; gap: 5px; }
.secretary-time-panel .legend-swatch { width: 11px; height: 11px; border-radius: 3px; border: 1px solid var(--dsw-alias-border-soft); background: var(--dsw-alias-surface); }
.secretary-time-panel .legend-swatch.high { background: var(--dsw-alias-high); border-color: var(--dsw-alias-high); }
.secretary-time-panel .legend-swatch.medium { background: var(--dsw-alias-medium); border-color: var(--dsw-alias-medium); }
.secretary-time-panel .legend-swatch.low { background: var(--dsw-alias-low); border-color: var(--dsw-alias-low); }
.secretary-time-panel .energy-hint { max-width: 780px; margin: 9px auto 0; color: var(--dsw-alias-muted); font-size: 10px; }
.secretary-time-panel .tag-manager { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.secretary-time-panel .tag-manager-toolbar { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--dsw-alias-border); background: var(--dsw-alias-surface); }
.secretary-time-panel .tag-manager-body { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 16px 78px; }
.secretary-time-panel .tag-manager-inner { max-width: 760px; margin: 0 auto; }
.secretary-time-panel .manager-hint { margin-bottom: 10px; color: var(--dsw-alias-muted); font-size: 10px; }
.secretary-time-panel .root-drop { margin-bottom: 8px; padding: 7px 9px; border: 1px dashed var(--dsw-alias-border); border-radius: var(--dsw-alias-radius-small); color: var(--dsw-alias-muted); font-size: 10px; text-align: center; }
.secretary-time-panel .root-drop.is-drop-target, .secretary-time-panel .manage-row.is-drop-target { background: var(--dsw-alias-accent-soft); border-color: var(--dsw-alias-accent); }
.secretary-time-panel .manage-row { min-height: 38px; display: flex; align-items: center; gap: 6px; margin-left: calc(var(--depth, 0) * 20px); padding: 3px 5px; border: 1px solid transparent; border-radius: var(--dsw-alias-radius-small); background: var(--dsw-alias-surface); }
.secretary-time-panel .manage-row:hover { border-color: var(--dsw-alias-border-soft); }
.secretary-time-panel .drag-handle { color: var(--dsw-alias-muted); cursor: grab; }
.secretary-time-panel .manage-color { width: 18px; height: 18px; border: 1px solid var(--dsw-alias-border-soft); border-radius: 5px; background: var(--tag-color); padding: 0; }
.secretary-time-panel .manage-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-text); font-size: 12px; }
.secretary-time-panel .manage-id { color: var(--dsw-alias-muted); font-family: var(--dsw-alias-font-mono); font-size: 9px; }
.secretary-time-panel .manage-actions { display: flex; align-items: center; gap: 1px; }
.secretary-time-panel .manage-actions .icon-button { min-width: 27px; min-height: 27px; }
.secretary-time-panel .manage-edit { flex: 1; min-width: 0; }
.secretary-time-panel .draft-box { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; padding: 9px; border: 1px solid var(--dsw-alias-border); border-radius: var(--dsw-alias-radius); background: var(--dsw-alias-surface); }
.secretary-time-panel .draft-label { flex: none; color: var(--dsw-alias-muted); font-size: 10px; }
@media (max-width: 820px) {
.secretary-time-panel .canvas-layout { grid-template-columns: minmax(0, 1fr) 236px; }
.secretary-time-panel .topbar { gap: 9px; }
.secretary-time-panel .brand-name { display: none; }
.secretary-time-panel .repeat-note { display: none; }
}
@media (max-width: 640px) {
.secretary-time-panel .topbar { flex-wrap: wrap; gap: 4px 8px; padding: 6px 8px; }
.secretary-time-panel .brand { order: 1; }
.secretary-time-panel .top-actions { order: 2; }
.secretary-time-panel .module-nav { order: 3; width: 100%; justify-content: space-between; }
.secretary-time-panel .nav-button { flex: 1; justify-content: center; padding-inline: 5px; }
.secretary-time-panel .time-toolbar { padding-inline: 8px; gap: 5px; }
.secretary-time-panel .segmented button { padding-inline: 7px; font-size: 10px; }
.secretary-time-panel .granularity { gap: 4px; }
.secretary-time-panel .granularity > span { display: none; }
.secretary-time-panel .date-strip { padding-inline: 8px; gap: 5px; }
.secretary-time-panel .date-label { font-size: 11px; padding-inline: 4px; }
.secretary-time-panel .canvas-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 196px; }
.secretary-time-panel .tag-shelf { border-left: 0; border-top: 1px solid var(--dsw-alias-border); }
.secretary-time-panel .shelf-head { padding: 6px 9px; }
.secretary-time-panel .search-input { margin-top: 5px; padding-block: 4px; }
.secretary-time-panel .shelf-body { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: 0 4px; }
.secretary-time-panel .shelf-foot { display: none; }
.secretary-time-panel .canvas-status { padding-inline: 9px; }
.secretary-time-panel .canvas-status > span:last-child { display: none; }
.secretary-time-panel .floating { left: 8px !important; right: 8px; top: auto !important; bottom: 58px; width: auto !important; max-height: 61dvh; }
.secretary-time-panel .energy-module { padding: 9px 8px 68px; }
.secretary-time-panel .energy-head { align-items: flex-start; flex-direction: column; gap: 8px; }
.secretary-time-panel .energy-grid { grid-template-columns: 34px repeat(7, minmax(0, 1fr)); gap: 2px; }
.secretary-time-panel .energy-cell, .secretary-time-panel .energy-hour { height: 20px; }
.secretary-time-panel .tag-manager-toolbar { padding-inline: 9px; }
.secretary-time-panel .tag-manager-body { padding-inline: 9px; }
.secretary-time-panel .manage-id { display: none; }
.secretary-time-panel .manage-row { margin-left: calc(var(--depth, 0) * 13px); }
.secretary-time-panel .draft-box { flex-wrap: wrap; }
.secretary-time-panel .draft-label { width: 100%; }
}

/* Panel-only additions on top of the prototype stylesheet. */
.secretary-time-panel .placeholder { flex: 1; display: grid; place-items: center; padding: 24px; color: var(--dsw-alias-muted); text-align: center; }
.secretary-time-panel .canvas-status .record-toggle { flex: none; }
.secretary-time-panel .tag-choice.is-erase { background: var(--dsw-alias-danger-soft); color: var(--dsw-alias-danger); }
.secretary-time-panel .shelf-foot.is-erase { color: var(--dsw-alias-danger); }
.secretary-time-panel .record-fragment.is-running { box-shadow: inset 0 0 0 1px var(--dsw-alias-on-tag); }
.secretary-time-panel .editor-details { margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--dsw-alias-border-soft); }
.secretary-time-panel .details-toggle { border: 0; background: transparent; color: var(--dsw-alias-muted); padding: 0; font-size: 10px; font-weight: 600; }
.secretary-time-panel .details-toggle:hover { color: var(--dsw-alias-text); }
.secretary-time-panel .editor-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 8px; }
.secretary-time-panel .editor-fields label { display: flex; flex-direction: column; gap: 4px; color: var(--dsw-alias-muted); font-size: 10px; font-weight: 600; }
.secretary-time-panel .editor-fields input, .secretary-time-panel .editor-fields select { width: 100%; min-width: 0; border: 1px solid var(--dsw-alias-border); border-radius: var(--dsw-alias-radius-small); background: var(--dsw-alias-bg); color: var(--dsw-alias-text); padding: 5px 7px; font-size: 11px; }
.secretary-time-panel .editor-fields .wide { grid-column: 1 / -1; }

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

@media (max-width: 700px) {
  .secretary-time-panel .module-bar { flex-wrap: wrap; row-gap: 4px; padding: 5px 8px; }
  .secretary-time-panel .module-bar-tail { margin-left: 0; width: 100%; justify-content: space-between; }
  .secretary-time-panel .granularity > span { display: none; }
  .secretary-time-panel .module-bar .week-strip { order: 3; width: 100%; }
}

@media (max-width: 640px) {
  .secretary-time-panel .gtd-tabs { padding-inline: 8px; }
  .secretary-time-panel .gtd-section { padding: 10px 8px; }
  .secretary-time-panel .gtd-date-grid { grid-template-columns: minmax(0, 1fr); }
  .secretary-time-panel .gtd-action-main { min-width: 150px; }
}
.secretary-time-panel .strip-tail { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.secretary-time-panel .warning-strip.is-error { background: var(--dsw-alias-danger-soft); color: var(--dsw-alias-danger); }
.secretary-time-panel .canvas-hint { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
body[data-ds-dark-theme] .secretary-time-panel .record-fragment { color: var(--dsw-static-neutral-1000, #151619); background-image: linear-gradient(rgba(255, 255, 255, 0.32), rgba(255, 255, 255, 0.32)); }
body[data-ds-dark-theme] .secretary-time-panel .tag-dot { filter: brightness(1.35) saturate(0.9); }
body[data-ds-dark-theme] .secretary-time-panel .manage-color { filter: brightness(1.35) saturate(0.9); }
@media (max-width: 640px) { .secretary-time-panel .canvas-hint { display: none; } }
.secretary-time-panel .editor-tags { max-height: 240px; overflow-y: auto; }
.secretary-time-panel .editor-actions-tail { display: flex; align-items: center; gap: 6px; }
.secretary-time-panel .module-bar { flex: none; display: flex; align-items: center; gap: 9px; min-height: 42px; padding: 4px 14px; background: var(--dsw-alias-surface); border-bottom: 1px solid var(--dsw-alias-border-soft); }
.secretary-time-panel .module-bar-tail { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.secretary-time-panel .module-bar .date-label { font-weight: 600; }
.secretary-time-panel .shelf-paint { display: flex; align-items: center; gap: 5px; margin-top: 7px; padding: 0 1px; color: var(--dsw-alias-text-secondary); font-size: 10px; font-weight: 600; }
.secretary-time-panel .shelf-paint .tag-dot { width: 8px; height: 8px; border-radius: 2px; }
.secretary-time-panel .shelf-paint.is-erase { color: var(--dsw-alias-danger); }
.secretary-time-panel .shelf-paint-hint { margin-left: auto; width: 15px; height: 15px; display: grid; place-items: center; border: 1px solid var(--dsw-alias-border); border-radius: 50%; background: transparent; color: var(--dsw-alias-muted); padding: 0; font-size: 9px; line-height: 1; }
.secretary-time-panel .notice-popover { position: absolute; z-index: 95; top: calc(100% + 6px); right: 12px; width: min(430px, calc(100% - 24px)); display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border); border-radius: var(--dsw-alias-radius); background: var(--dsw-alias-surface-raised); box-shadow: var(--dsw-alias-shadow); }
.secretary-time-panel .notice-text { flex: 1; min-width: 0; color: var(--dsw-alias-text-secondary); font-size: 11px; line-height: 1.45; word-break: break-word; }
.secretary-time-panel .toast { position: absolute; z-index: 96; left: 50%; bottom: 18px; transform: translateX(-50%); max-width: calc(100% - 24px); display: flex; align-items: center; gap: 10px; padding: 7px 11px; border-radius: var(--dsw-alias-radius); background: var(--dsw-alias-text); color: var(--dsw-alias-surface); box-shadow: var(--dsw-alias-shadow); font-size: 11px; }
.secretary-time-panel .toast-message { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.secretary-time-panel .toast button { flex: none; border: 0; background: transparent; color: inherit; padding: 2px 3px; font-size: 10px; text-decoration: underline; }
`
