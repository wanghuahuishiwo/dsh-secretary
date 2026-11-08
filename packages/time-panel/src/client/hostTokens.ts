/**
 * Host token binding for the TimeBlock module.
 *
 * DSH exposes its theme and alias values as `--dsw-*`; the module contract is
 * `--tb-*`. This is the only production file that reads `--dsw-*`: the UI
 * consumes `--tb-*` so OpenDesign can supply the same contract from
 * `design/time-block/tokens.css` without a host.
 */
export const hostTokens = `.tb-host {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding-top: 12px;
  background: var(--tb-surface-page, #0a0a0b);

  --tb-surface-page: var(--dsw-alias-bg-layer-1, #0e0f12);
  --tb-surface-rail: var(--dsw-alias-bg-layer-2, #1d2025);
  --tb-surface-raised: var(--dsw-alias-bg-layer-2, #1d2025);
  --tb-surface-hover: var(--dsw-alias-bg-module-platform, #252931);
  --tb-grid-cell: color-mix(in srgb, var(--dsw-alias-bg-layer-2, #1d2025) 70%, var(--dsw-alias-label-tertiary, #727a88) 30%);
  --tb-grid-top: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #f7f8fa) 70%, var(--dsw-alias-label-tertiary, #84898f) 30%);
  --tb-grid-mid: color-mix(in srgb, var(--dsw-alias-bg-layer-2, #ffffff) 55%, var(--dsw-alias-label-tertiary, #84898f) 45%);
  --tb-grid-bottom: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #f7f8fa) 75%, var(--dsw-alias-label-tertiary, #84898f) 25%);
  --tb-text-primary: var(--dsw-alias-label-primary, #eceff3);
  --tb-text-secondary: var(--dsw-alias-label-secondary, #a3a9b4);
  --tb-text-tertiary: var(--dsw-alias-label-tertiary, #727a88);
  --tb-border-subtle: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.07));
  --tb-border-strong: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.14));
  --tb-accent: var(--dsw-alias-link, #82aaff);
  --tb-accent-soft: var(--dsw-alias-interactive-bg-hover-accent, rgba(102, 141, 222, 0.16));
  --tb-danger: var(--dsw-alias-state-error-primary, #ef8c84);
  --tb-selection: var(--dsw-alias-label-primary, #f4f7fb);
  --tb-deep-high: #5aa86a;
  --tb-deep-medium: #b99530;
  --tb-deep-low: #79808c;

  /* sizes */
  --tb-hour-height: 26px;
  --tb-control-height: 30px;
  --tb-shelf-width: 116px;
  --tb-status-height: 42px;
  --tb-gutter-width: 46px;
  --tb-hour-width: 26px;
  --tb-font-date: 34px;
  --tb-font-cat: 13px;

  /* fonts */
  --tb-font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", system-ui, sans-serif;
  --tb-font-caption: 10px;
  --tb-font-label: 11px;
  --tb-font-body: 12px;
  --tb-font-title: 15px;
}
.tb-host > .tb-app { flex: 1 1 auto; min-height: 0; }
.tb-host .tb-head { height: 52px; }
/* The module keeps the reference's near-black material in DSH dark mode. */
.tb-host-dark {
  --tb-surface-page: #0a0a0b;
  --tb-surface-rail: #151515;
  --tb-surface-raised: #1d1e20;
  --tb-surface-hover: #26272a;
  --tb-grid-cell: #4a4c50;
  --tb-grid-top: #202020;
  --tb-grid-mid: #505050;
  --tb-grid-bottom: #303030;
  --tb-text-primary: #f2f3f4;
  --tb-text-secondary: #a6a9ad;
  --tb-text-tertiary: #767a80;
  --tb-border-subtle: rgba(255, 255, 255, 0.08);
  --tb-border-strong: rgba(255, 255, 255, 0.16);
  --tb-selection: #f4f7fb;
}
`
