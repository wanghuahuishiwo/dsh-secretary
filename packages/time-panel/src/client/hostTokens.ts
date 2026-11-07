/**
 * Host token binding for the TimeBlock module.
 *
 * DSH exposes its theme and alias values as `--dsw-*`; the module contract is
 * `--tb-*`. T2 keeps the T1 components on their existing `--dsw-*` reads, so
 * this file establishes the module namespace, the wrapper geometry and the
 * `--tb-*` aliases that T3 will switch the components over to.
 */
export const hostTokens = `.tb-host {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;

  --tb-surface-page: var(--dsw-alias-bg-layer-1, #151517);
  --tb-surface-rail: var(--dsw-alias-bg-layer-2, #1b1b1e);
  --tb-surface-raised: var(--dsw-alias-bg-module-platform, #212125);
  --tb-surface-hover: var(--dsw-alias-bg-layer-3, #212125);
  --tb-grid-cell: var(--dsw-alias-bg-layer-2, #2b2b31);
  --tb-text-primary: var(--dsw-alias-label-primary, #ececef);
  --tb-text-secondary: var(--dsw-alias-label-secondary, #a2a2aa);
  --tb-text-tertiary: var(--dsw-alias-label-tertiary, #71717a);
  --tb-border-subtle: var(--dsw-alias-border-l2, rgba(255, 255, 255, .09));
  --tb-border-strong: var(--dsw-alias-border-l3, rgba(255, 255, 255, .14));
  --tb-accent: var(--dsw-alias-link, #5b8def);
  --tb-accent-soft: var(--dsw-alias-interactive-bg-hover-accent, rgba(91, 141, 239, .18));
  --tb-danger: var(--dsw-alias-state-error-primary, #e0554b);
  --tb-selection: var(--dsw-alias-label-primary, #ffffff);

  --tb-font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", system-ui, sans-serif;
  --tb-font-caption: 10.5px;
  --tb-font-label: 11.5px;
  --tb-font-body: 13px;
  --tb-font-title: 14.5px;

  --tb-space-1: 2px;
  --tb-space-2: 4px;
  --tb-space-3: 6px;
  --tb-space-4: 10px;
  --tb-space-5: 14px;
  --tb-space-6: 18px;

  --tb-radius-sm: 5px;
  --tb-radius-md: 7px;
  --tb-radius-lg: 14px;

  --tb-control-height: 28px;
  --tb-hour-height: 40px;
  --tb-rail-width: 46px;
  --tb-shelf-width: 118px;
  --tb-status-height: 36px;

  --tb-deep-high: #6fbf73;
  --tb-deep-medium: #e0c04a;
  --tb-deep-low: #9aa0ac;
}
.tb-host > .sec-shell { flex: 1 1 auto; min-height: 0; }
`
