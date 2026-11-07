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
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;

  --tb-surface-page: var(--dsw-alias-bg-layer-1, #0e0f12);
  --tb-surface-rail: var(--dsw-alias-bg-layer-1, #16181c);
  --tb-surface-raised: var(--dsw-alias-bg-layer-2, #1d2025);
  --tb-surface-hover: var(--dsw-alias-bg-module-platform, #252931);
  --tb-grid-cell: var(--dsw-alias-bg-layer-2, #191c21);
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

  /* fonts */
  --tb-font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", system-ui, sans-serif;
  --tb-font-caption: 10px;
  --tb-font-label: 11px;
  --tb-font-body: 12px;
  --tb-font-title: 15px;
}
.tb-host > .tb-app { flex: 1 1 auto; min-height: 0; }
`
