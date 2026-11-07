/**
 * The product shell's stylesheet: one narrow column that behaves like the
 * iPhone 时间块 app. Every colour comes from the module's `--tb-*` contract, so
 * production (host binding) and OpenDesign (module tokens) share one palette.
 */
export const timeStyles = `.tb-app {
  position: relative;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--tb-surface-rail, #16181c);
  color: var(--tb-text-primary, #eceff3);
  font-family: var(--tb-font-family, -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", system-ui, sans-serif);
  font-size: var(--tb-font-body, 12px);
  line-height: 1.45;
}
.tb-app *, .tb-app *::before, .tb-app *::after { box-sizing: border-box; }
.tb-app button, .tb-app input, .tb-app textarea { font: inherit; color: inherit; }
.tb-app button { background: none; border: 0; cursor: pointer; }
.tb-app :focus-visible { outline: 2px solid var(--tb-accent, #82aaff); outline-offset: 1px; }

/* ---------- header ---------- */
.tb-head { flex: none; height: 42px; display: flex; align-items: center; gap: 2px; padding: 0 8px; }
/* A host action (OD theme/preview) gets its own compact row; production keeps the 42px row. */
.tb-head.has-action { height: auto; min-height: 42px; flex-wrap: wrap; gap: 1px; padding: 7px 6px; }
.tb-head.has-action .tb-daylabel { padding: 0 7px; }
.tb-hbtn { width: 28px; height: 28px; border-radius: 7px; color: var(--tb-text-secondary, #a3a9b4); display: grid; place-items: center; padding: 0; }
.tb-hbtn:hover { background: var(--tb-surface-hover, #252931); color: var(--tb-text-primary, #eceff3); }
.tb-hbtn:disabled { opacity: .28; cursor: default; }
.tb-hbtn:disabled:hover { background: none; color: var(--tb-text-secondary, #a3a9b4); }
.tb-hbtn svg { width: 16px; height: 16px; }
.tb-module-switch { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 9px 0 6px;
  border-radius: 8px; color: var(--tb-text-primary, #eceff3); }
.tb-module-switch:hover { background: var(--tb-surface-hover, #252931); }
.tb-module-switch:focus-visible { outline: 2px solid var(--tb-accent, #82aaff); outline-offset: 1px; }
.tb-switch-icon { width: 16px; height: 16px; flex: none; color: var(--tb-text-secondary, #a3a9b4); }
.tb-module-switch:hover .tb-switch-icon { color: var(--tb-text-primary, #eceff3); }
.tb-switch-caret { width: 11px; height: 11px; flex: none; color: var(--tb-text-tertiary, #727a88); }
.tb-title { font-size: 14.5px; font-weight: 600; letter-spacing: .1px; white-space: nowrap; }
.tb-daylabel { height: 24px; padding: 0 8px; border-radius: 6px; color: var(--tb-text-primary, #eceff3); font-size: var(--tb-font-body, 12px);
  font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tb-daylabel:hover { background: var(--tb-surface-hover, #252931); }
.tb-now { height: 24px; padding: 0 8px; border-radius: 6px; color: var(--tb-text-tertiary, #727a88); font-size: var(--tb-font-label, 11px); }
.tb-now:hover { background: var(--tb-surface-hover, #252931); color: var(--tb-text-primary, #eceff3); }

/* ---------- 自绘日历（时间块选天 / 深度时间选周） ---------- */
.tb-picker { position: absolute; right: 2px; top: 44px; z-index: 24; width: 258px; padding: 8px;
  border-radius: 10px; background: var(--tb-surface-raised, #1d2025); border: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14)); box-shadow: 0 14px 38px rgba(0, 0, 0, .38); }
.tb-picker-head { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
.tb-picker-title { flex: 1; text-align: center; font-size: var(--tb-font-body, 12px); font-weight: 600; color: var(--tb-text-primary, #eceff3); }
.tb-picker-nav { width: 24px; height: 24px; border-radius: 6px; color: var(--tb-text-tertiary, #727a88); display: grid; place-items: center; padding: 0; }
.tb-picker-nav:hover { background: var(--tb-surface-hover, #252931); color: var(--tb-text-primary, #eceff3); }
.tb-picker-nav svg { width: 12px; height: 12px; }
.tb-picker-weekdays, .tb-picker-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
.tb-picker-weekdays { margin-bottom: 2px; }
.tb-picker-weekdays span { text-align: center; font-size: var(--tb-font-caption, 10px); color: var(--tb-text-tertiary, #727a88); padding: 3px 0; }
.tb-picker-grid button { height: 28px; border-radius: 5px; color: var(--tb-text-secondary, #a3a9b4); font-size: var(--tb-font-body, 12px);
  font-variant-numeric: tabular-nums; }
.tb-picker-grid button:hover { background: var(--tb-surface-hover, #252931); color: var(--tb-text-primary, #eceff3); }
.tb-picker-grid button.out { color: var(--tb-text-tertiary, #727a88); opacity: .5; }
.tb-picker-grid button.today { color: var(--tb-accent, #82aaff); font-weight: 700; }
.tb-picker-grid button.on { background: var(--tb-accent, #82aaff); color: #fff; font-weight: 600; }
.tb-picker-grid button.on.today { color: #fff; }
.tb-picker-grid button.wstart { border-radius: 5px 0 0 5px; }
.tb-picker-grid button.wend { border-radius: 0 5px 5px 0; }
.tb-picker-grid button.wstart.wend { border-radius: 5px; }
.tb-picker-foot { display: flex; align-items: center; gap: 6px; margin-top: 6px; padding-top: 6px;
  border-top: 1px solid var(--tb-border-subtle, rgba(255, 255, 255, 0.07)); font-size: var(--tb-font-caption, 10px); color: var(--tb-text-tertiary, #727a88); }
.tb-picker-now { margin-left: auto; height: 22px; padding: 0 8px; border-radius: 5px; color: var(--tb-accent, #82aaff); font-size: var(--tb-font-label, 11px); }
.tb-picker-now:hover { background: var(--tb-accent-soft, rgba(102, 141, 222, 0.16)); }
.tb-title svg { width: 11px; height: 11px; color: var(--tb-text-tertiary, #727a88); transition: transform .16s; }
.tb-title[aria-expanded="true"] svg { transform: rotate(180deg); }
.tb-head .grow { flex: 1; }

/* ---------- views ---------- */
.tb-views { flex: 1; min-height: 0; position: relative; }
.tb-view { position: absolute; inset: 0; display: none; min-height: 0; }
.tb-view.on { display: flex; flex-direction: column; }

/* ---------- 时间块 ---------- */
.tb-tb { flex: 1; min-height: 0; display: flex; }
.tb-tb-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.tb-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; overflow-anchor: auto; }
.tb-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; }
.tb-scroll:hover { scrollbar-color: rgba(128, 128, 128, 0.25) transparent; }
.tb-scroll::-webkit-scrollbar { width: 4px; }
.tb-scroll::-webkit-scrollbar-track { background: transparent; }
.tb-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 2px; }
.tb-scroll:hover::-webkit-scrollbar-thumb { background: rgba(128, 128, 128, 0.25); }
.tb-scroll:hover::-webkit-scrollbar-thumb:hover { background: rgba(128, 128, 128, 0.45); }
.tb-days { position: relative; }
.tb-day { position: relative; display: flex; }
.tb-day + .tb-day { border-top: 1px dashed var(--tb-border-strong, rgba(255, 255, 255, 0.14)); }
.tb-gutter { width: 46px; flex: none; position: relative; }
.tb-datemark { position: absolute; left: 6px; top: 5px; display: flex; flex-direction: column; gap: 1px; pointer-events: none; }
.tb-datemark .m { font-size: var(--tb-font-caption, 10px); color: var(--tb-text-tertiary, #727a88); letter-spacing: .3px; }
.tb-datemark .d { font-size: 21px; line-height: 1.05; font-weight: 600; color: var(--tb-text-primary, #eceff3); font-variant-numeric: tabular-nums; letter-spacing: -.2px; }
.tb-datemark .w { font-size: var(--tb-font-caption, 10px); color: var(--tb-text-secondary, #a3a9b4); }
.tb-datemark .t { font-size: var(--tb-font-caption, 10px); color: var(--tb-text-tertiary, #727a88); }
.tb-datemark .t.today { color: var(--tb-accent, #82aaff); }
.tb-hours { width: 22px; flex: none; position: relative; }
.tb-hours span { position: absolute; right: 5px; font-size: var(--tb-font-caption, 10px); color: var(--tb-text-tertiary, #727a88); font-variant-numeric: tabular-nums; letter-spacing: -.1px; }
.tb-hours span.now { color: var(--tb-text-primary, #eceff3); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
.tb-grid { flex: 1; position: relative; min-width: 0; }
.tb-cells { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(6, 1fr); }
.tb-cell { border-right: 1px solid var(--tb-border-subtle, rgba(255, 255, 255, 0.07)); border-bottom: 1px solid var(--tb-border-subtle, rgba(255, 255, 255, 0.07)); cursor: crosshair; }
.tb-cell:nth-child(6n) { border-right: 0; }
.tb-cell.hourlast { border-bottom: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14)); }
.tb-cell:hover { background: var(--tb-surface-hover, #252931); }
.tb-blocks, .tb-sel { position: absolute; inset: 0; pointer-events: none; }
.tb-blk { position: absolute; overflow: hidden; display: flex; align-items: center; padding: 0 4px;
  font-size: var(--tb-font-caption, 10px); font-weight: 600; letter-spacing: .1px; color: #fff; white-space: nowrap; }
.tb-blk span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Overlap stays in the data but not in the cell: one record plus a count badge. */
.tb-more { position: absolute; z-index: 4; width: 16px; height: 16px; display: grid; place-items: center; padding: 0;
  border: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14)); border-radius: 4px;
  background: var(--tb-surface-raised, #1d2025); color: var(--tb-text-primary, #eceff3);
  font-size: 10px; font-weight: 700; line-height: 1; pointer-events: auto; cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .35); }
.tb-more:hover { background: var(--tb-surface-hover, #252931); }
.tb-pop { position: absolute; z-index: 6; left: 6px; right: 6px; display: flex; flex-direction: column; gap: 1px;
  padding: 5px; border: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14)); border-radius: 8px;
  background: var(--tb-surface-raised, #1d2025); box-shadow: 0 10px 30px rgba(0, 0, 0, .42); pointer-events: auto; }
.tb-pop-title { padding: 2px 6px 5px; color: var(--tb-text-tertiary, #727a88); font-size: var(--tb-font-caption, 10px); }
.tb-pop-row { width: 100%; height: 28px; display: flex; align-items: center; gap: 7px; padding: 0 6px; border: 0; border-radius: 5px;
  background: transparent; color: var(--tb-text-primary, #eceff3); font-size: var(--tb-font-label, 11px); text-align: left; }
.tb-pop-row:hover { background: var(--tb-surface-hover, #252931); }
.tb-pop-row i { width: 8px; height: 8px; flex: none; border-radius: 2px; }
.tb-pop-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-pop-row time { margin-left: auto; flex: none; color: var(--tb-text-tertiary, #727a88); font-size: var(--tb-font-caption, 10px); font-variant-numeric: tabular-nums; }
.tb-selbox { position: absolute; box-shadow: inset 0 0 0 2px var(--tb-selection, #f4f7fb); pointer-events: none; }
.tb-selbox i { position: absolute; top: 0; bottom: 0; display: grid; place-items: center; }
.tb-selbox i svg { width: 12px; height: 12px; color: var(--tb-text-primary, #eceff3); }
.tb-nowline { position: absolute; width: 2px; background: var(--tb-text-primary, #eceff3); box-shadow: 0 0 0 .5px rgba(0, 0, 0, .45); }
.tb-jump { position: absolute; right: 12px; bottom: 12px; height: 27px; padding: 0 11px; border-radius: 14px;
  border: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14)); background: var(--tb-surface-raised, #1d2025); color: var(--tb-text-secondary, #a3a9b4); font-size: var(--tb-font-label, 11px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .28); opacity: 0; pointer-events: none; transition: opacity .16s; z-index: 5; }
.tb-jump.on { opacity: 1; pointer-events: auto; }

/* ---------- 类别列（标签架） ---------- */
.tb-shelf { width: var(--tb-shelf-width, 116px); flex: none; display: flex; flex-direction: column; min-height: 0; }
.tb-shelf.mini { width: 34px; }
.tb-shelf-head { flex: none; height: 30px; display: flex; align-items: center; gap: 4px; padding: 0 8px;
  color: var(--tb-text-tertiary, #727a88); font-size: var(--tb-font-caption, 10px); text-align: left; }
.tb-shelf-head:hover { color: var(--tb-text-secondary, #a3a9b4); }
.tb-shelf-head svg { width: 12px; height: 12px; flex: none; }
.tb-shelf.mini .tb-shelf-head { justify-content: center; padding: 0; }
.tb-shelf.mini .tb-shelf-head span, .tb-shelf.mini .tb-shelf-list, .tb-shelf.mini .tb-shelf-more { display: none; }
.tb-shelf-list { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 7px 8px; display: flex; flex-direction: column; gap: 5px; scrollbar-width: none; }
.tb-shelf-more { flex: none; height: 30px; color: var(--tb-text-tertiary, #727a88); font-size: var(--tb-font-label, 11px); text-align: left; padding: 0 14px; }
.tb-shelf-more:hover { color: var(--tb-text-secondary, #a3a9b4); }
.tb-brush { width: 20px; height: 20px; border-radius: 4px; margin: 6px auto 0; }
.tb-cat { flex: none; height: 33px; border-radius: 5px; color: #fff; font-size: var(--tb-font-body, 12px); font-weight: 600;
  letter-spacing: .2px; padding: 0 8px; display: flex; align-items: center; gap: 5px; text-align: left;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07); transition: filter .12s; }
.tb-cat:hover { filter: brightness(1.07); }
.tb-cat.sub { height: 28px; font-size: var(--tb-font-label, 11px); margin-left: 7px; }
.tb-cat .caret { margin-left: auto; width: 10px; height: 10px; opacity: .65; transition: transform .15s; }
.tb-cat[aria-expanded="true"] .caret { transform: rotate(90deg); }
.tb-cat span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---------- 选区徽章（替代底部状态栏） ---------- */
.tb-sel-badge { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); z-index: 10;
  padding: 4px 12px; border-radius: var(--tb-radius-md, 8px); border: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14));
  background: var(--tb-surface-raised, #1d2025); color: var(--tb-text-primary, #eceff3);
  font-size: var(--tb-font-label, 11px); font-weight: 600; font-variant-numeric: tabular-nums;
  pointer-events: none; white-space: nowrap; }

/* ---------- 一级抽屉 ---------- */
.tb-scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, .42); opacity: 0; pointer-events: none;
  transition: opacity .2s; z-index: 20; }
.tb-scrim.on { opacity: 1; pointer-events: auto; }
.tb-drawer { position: absolute; left: 0; top: 0; bottom: 0; width: 232px; z-index: 21; background: var(--tb-surface-raised, #1d2025);
  border-right: 1px solid var(--tb-border-subtle, rgba(255, 255, 255, 0.07)); padding: 14px 10px; display: flex; flex-direction: column;
  transform: translateX(-101%); transition: transform .26s cubic-bezier(.32, .72, 0, 1); box-shadow: 0 14px 38px rgba(0, 0, 0, .38); }
.tb-drawer.on { transform: none; }
.tb-drawer .cap { font-size: var(--tb-font-caption, 10px); color: var(--tb-text-tertiary, #727a88); padding: 2px 10px 10px; letter-spacing: .4px; }
.tb-mrow { flex: none; width: 100%; height: 40px; border-radius: 8px; color: var(--tb-text-secondary, #a3a9b4); font-size: 14px;
  display: flex; align-items: center; gap: 11px; padding: 0 10px; text-align: left; }
.tb-mrow:hover { background: var(--tb-surface-hover, #252931); color: var(--tb-text-primary, #eceff3); }
.tb-mrow.on { color: var(--tb-text-primary, #eceff3); background: var(--tb-accent-soft, rgba(102, 141, 222, 0.16)); }
.tb-mrow svg { width: 17px; height: 17px; flex: none; color: var(--tb-text-tertiary, #727a88); }
.tb-mrow.on svg { color: var(--tb-accent, #82aaff); }
.tb-dsep { flex: none; height: 1px; background: var(--tb-border-subtle, rgba(255, 255, 255, 0.07)); margin: 7px 10px; }

/* ---------- 二级菜单 ---------- */
.tb-smenu { position: absolute; z-index: 22; min-width: 172px; padding: 5px; border-radius: 10px; background: var(--tb-surface-hover, #252931);
  border: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14)); box-shadow: 0 14px 38px rgba(0, 0, 0, .38); opacity: 0; transform: translateY(-4px) scale(.98);
  pointer-events: none; transition: opacity .14s, transform .14s; transform-origin: top left; }
.tb-smenu.on { opacity: 1; transform: none; pointer-events: auto; }
.tb-smenu button { width: 100%; height: 32px; border-radius: 6px; color: var(--tb-text-secondary, #a3a9b4); font-size: var(--tb-font-body, 12px);
  display: flex; align-items: center; gap: 7px; padding: 0 8px; text-align: left; }
.tb-smenu button:hover { background: var(--tb-surface-raised, #1d2025); color: var(--tb-text-primary, #eceff3); }
.tb-smenu button.on { color: var(--tb-text-primary, #eceff3); font-weight: 600; }
.tb-smenu button svg { width: 12px; height: 12px; color: var(--tb-accent, #82aaff); opacity: 0; }
.tb-smenu button.on svg { opacity: 1; }

/* ---------- 编辑浮层 ---------- */
.tb-sheet { position: absolute; left: 0; right: 0; bottom: 0; z-index: 23; background: var(--tb-surface-raised, #1d2025);
  border-top: 1px solid var(--tb-border-subtle, rgba(255, 255, 255, 0.07)); border-radius: 14px 14px 0 0; box-shadow: 0 14px 38px rgba(0, 0, 0, .38);
  padding: 8px 12px 14px; max-height: 76%; overflow-y: auto;
  transform: translateY(101%); transition: transform .24s cubic-bezier(.32, .72, 0, 1); }
.tb-sheet.on { transform: none; }
.tb-sheet .grab { width: 34px; height: 4px; border-radius: 2px; background: var(--tb-border-strong, rgba(255, 255, 255, 0.14)); margin: 0 auto 11px; }
.tb-sheet .row { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
.tb-sheet .time { font-size: var(--tb-font-title, 15px); font-weight: 600; font-variant-numeric: tabular-nums; }
.tb-sheet .dur { font-size: var(--tb-font-label, 11px); color: var(--tb-text-tertiary, #727a88); background: var(--tb-surface-hover, #252931); border-radius: 4px; padding: 1px 6px; }
.tb-sheet .grow { flex: 1; }
.tb-step { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14)); color: var(--tb-text-secondary, #a3a9b4);
  font-size: 14px; line-height: 1; padding: 0; }
.tb-step:hover { background: var(--tb-surface-hover, #252931); color: var(--tb-text-primary, #eceff3); }
.tb-picks { display: flex; flex-wrap: wrap; gap: 5px; margin: 0 0 10px; }
.tb-picks button { height: 25px; border-radius: 5px; padding: 0 9px; font-size: var(--tb-font-label, 11px); color: #fff; opacity: .5; }
.tb-picks button.on { opacity: 1; box-shadow: inset 0 0 0 2px #fff, 0 0 0 2px var(--tb-accent, #82aaff); }
.tb-note { width: 100%; height: 30px; border-radius: 7px; border: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14)); background: var(--tb-surface-hover, #252931);
  color: var(--tb-text-primary, #eceff3); font-size: var(--tb-font-body, 12px); padding: 0 9px; margin-bottom: 10px; }
.tb-note::placeholder { color: var(--tb-text-tertiary, #727a88); }
.tb-acts { display: flex; gap: 8px; }
.tb-btn { height: 31px; flex: 1; border-radius: 7px; border: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14)); background: var(--tb-surface-hover, #252931); color: var(--tb-text-primary, #eceff3); font-size: var(--tb-font-body, 12px); }
.tb-btn.primary { background: var(--tb-text-primary, #eceff3); color: var(--tb-surface-rail, #16181c); border-color: transparent; font-weight: 600; }
.tb-btn.danger { color: var(--tb-danger, #ef8c84); border-color: color-mix(in srgb, var(--tb-danger, #ef8c84) 40%, transparent); }

/* ---------- toast ---------- */
.tb-toast { position: absolute; left: 50%; bottom: 16px; transform: translate(-50%, 6px); z-index: 30;
  background: var(--tb-surface-hover, #252931); border: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14)); border-radius: 8px; padding: 7px 13px;
  font-size: var(--tb-font-body, 12px); color: var(--tb-text-primary, #eceff3); box-shadow: 0 6px 18px rgba(0, 0, 0, .28); opacity: 0; pointer-events: none;
  transition: all .16s; max-width: 86%; }
.tb-toast.on { opacity: 1; transform: translate(-50%, 0); }

/* ---------- 深度时间 ---------- */
.tb-deep { flex: 1; min-height: 0; display: flex; }
.tb-deep-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.tb-deep-head { flex: none; height: 26px; display: flex; padding-left: 30px; border-bottom: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14)); }
.tb-deep-head .d { flex: 1; display: grid; place-items: center; font-size: var(--tb-font-caption, 10px); color: var(--tb-text-tertiary, #727a88); }
.tb-deep-head .d.today { color: var(--tb-accent, #82aaff); font-weight: 600; }
.tb-deep-body { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.tb-deep-hours { width: 30px; flex: none; position: relative; }
.tb-deep-hours span { position: absolute; right: 6px; font-size: var(--tb-font-caption, 10px); color: var(--tb-text-tertiary, #727a88); font-variant-numeric: tabular-nums; }
.tb-deep-cols { flex: 1; display: flex; min-width: 0; position: relative; touch-action: none; background: var(--tb-surface-hover, #252931); }
.tb-deep-col { flex: 1; min-width: 0; position: relative; }
.tb-hc { position: absolute; left: 0; right: 0; background: var(--tb-grid-cell, #191c21); cursor: crosshair; box-shadow: 0 0 0 1px var(--tb-surface-hover, #252931); }
.tb-hc:hover { filter: brightness(1.12); }
.tb-hc.H { background: color-mix(in srgb, var(--tb-deep-high, #5aa86a) 52%, var(--tb-grid-cell, #191c21)); }
.tb-hc.M { background: color-mix(in srgb, var(--tb-deep-medium, #b99530) 40%, var(--tb-grid-cell, #191c21)); }
.tb-hc.L { background: color-mix(in srgb, var(--tb-deep-low, #79808c) 32%, var(--tb-grid-cell, #191c21)); }
  border-top: 1px solid var(--tb-border-strong, rgba(255, 255, 255, 0.14)); background: var(--tb-surface-raised, #1d2025); font-size: var(--tb-font-body, 12px); color: var(--tb-text-secondary, #a3a9b4); }
`
