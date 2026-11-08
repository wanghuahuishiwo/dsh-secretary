/**
 * Host layout for the TimeBlock module.
 *
 * The module palette (`--tb-*`) is defined once in `src/ui/styles.ts` and
 * selected by the `theme` prop, so this file no longer repeats colours or
 * sizes for the host. It only makes the product fill the DSH Sidebar.
 */
export const hostTokens = `.tb-host {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.tb-host > .tb-app { flex: 1 1 auto; min-height: 0; }
`
