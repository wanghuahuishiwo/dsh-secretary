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
  background: var(--tb-surface-rail, #151517);
  color: var(--tb-text-primary, #ececef);
  font-family: var(--tb-font-family, -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", system-ui, sans-serif);
  font-size: 13px;
  line-height: 1.45;

  --rail: var(--tb-surface-rail, #151517);
  --rail-2: var(--tb-surface-raised, #1b1b1e);
  --rail-3: var(--tb-surface-hover, #212125);
  --cell: var(--tb-grid-cell, #2b2b31);
  --line: var(--tb-border-subtle, rgba(255, 255, 255, .09));
  --line-2: var(--tb-border-strong, rgba(255, 255, 255, .14));
  --dash: var(--tb-border-strong, #4f4f57);
  --txt: var(--tb-text-primary, #ececef);
  --txt-2: var(--tb-text-secondary, #a2a2aa);
  --txt-3: var(--tb-text-tertiary, #71717a);
  --txt-4: var(--tb-text-tertiary, #55555d);
  --accent: var(--tb-accent, #5b8def);
  --accent-soft: var(--tb-accent-soft, rgba(91, 141, 239, .18));
  --danger: var(--tb-danger, #e0554b);
  --sel-ring: var(--tb-selection, #ffffff);
  --sel-ink: var(--tb-selection, #101014);
  --shadow: 0 14px 38px rgba(0, 0, 0, .38);
  --shadow-sm: 0 6px 18px rgba(0, 0, 0, .28);
}
.tb-app *, .tb-app *::before, .tb-app *::after { box-sizing: border-box; }
.tb-app button, .tb-app input, .tb-app textarea { font: inherit; color: inherit; }
.tb-app button { background: none; border: 0; cursor: pointer; }
.tb-app :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

/* ---------- header ---------- */
.tb-head { flex: none; height: 42px; display: flex; align-items: center; gap: 2px; padding: 0 8px; }
/* A host action (OD theme/preview) gets its own compact row; production keeps the 42px row. */
.tb-head.has-action { height: auto; min-height: 42px; flex-wrap: wrap; gap: 1px; padding: 7px 6px; }
.tb-head.has-action .tb-daylabel { padding: 0 7px; }
.tb-hbtn { width: 28px; height: 28px; border-radius: 7px; color: var(--txt-2); display: grid; place-items: center; padding: 0; }
.tb-hbtn:hover { background: var(--rail-3); color: var(--txt); }
.tb-hbtn:disabled { opacity: .28; cursor: default; }
.tb-hbtn:disabled:hover { background: none; color: var(--txt-2); }
.tb-hbtn svg { width: 16px; height: 16px; }
.tb-title { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 7px 0 8px; border-radius: 7px;
  color: var(--txt); font-size: 14.5px; font-weight: 600; letter-spacing: .1px; }
.tb-title:hover { background: var(--rail-3); }
.tb-title .tsub { font-weight: 500; font-size: 12.5px; color: var(--txt-3); }
.tb-title .tsub:not(:empty)::before { content: "· "; }
.tb-daylabel { height: 24px; padding: 0 8px; border-radius: 6px; color: var(--txt); font-size: 12.5px;
  font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tb-daylabel:hover { background: var(--rail-3); }
.tb-now { height: 24px; padding: 0 8px; border-radius: 6px; color: var(--txt-3); font-size: 11.5px; }
.tb-now:hover { background: var(--rail-3); color: var(--txt); }

/* ---------- 自绘日历（时间块选天 / 深度时间选周） ---------- */
.tb-picker { position: absolute; right: 2px; top: 44px; z-index: 24; width: 258px; padding: 8px;
  border-radius: 10px; background: var(--rail-2); border: 1px solid var(--line-2); box-shadow: var(--shadow); }
.tb-picker-head { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
.tb-picker-title { flex: 1; text-align: center; font-size: 12.5px; font-weight: 600; color: var(--txt); }
.tb-picker-nav { width: 24px; height: 24px; border-radius: 6px; color: var(--txt-3); display: grid; place-items: center; padding: 0; }
.tb-picker-nav:hover { background: var(--rail-3); color: var(--txt); }
.tb-picker-nav svg { width: 12px; height: 12px; }
.tb-picker-weekdays, .tb-picker-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
.tb-picker-weekdays { margin-bottom: 2px; }
.tb-picker-weekdays span { text-align: center; font-size: 10px; color: var(--txt-4); padding: 3px 0; }
.tb-picker-grid button { height: 28px; border-radius: 5px; color: var(--txt-2); font-size: 12px;
  font-variant-numeric: tabular-nums; }
.tb-picker-grid button:hover { background: var(--rail-3); color: var(--txt); }
.tb-picker-grid button.out { color: var(--txt-4); opacity: .5; }
.tb-picker-grid button.today { color: var(--accent); font-weight: 700; }
.tb-picker-grid button.on { background: var(--accent); color: #fff; font-weight: 600; }
.tb-picker-grid button.on.today { color: #fff; }
.tb-picker-grid button.wstart { border-radius: 5px 0 0 5px; }
.tb-picker-grid button.wend { border-radius: 0 5px 5px 0; }
.tb-picker-grid button.wstart.wend { border-radius: 5px; }
.tb-picker-foot { display: flex; align-items: center; gap: 6px; margin-top: 6px; padding-top: 6px;
  border-top: 1px solid var(--line); font-size: 10.5px; color: var(--txt-4); }
.tb-picker-now { margin-left: auto; height: 22px; padding: 0 8px; border-radius: 5px; color: var(--accent); font-size: 11.5px; }
.tb-picker-now:hover { background: var(--accent-soft); }
.tb-title svg { width: 11px; height: 11px; color: var(--txt-3); transition: transform .16s; }
.tb-title[aria-expanded="true"] svg { transform: rotate(180deg); }
.tb-head .grow { flex: 1; }

/* ---------- views ---------- */
.tb-views { flex: 1; min-height: 0; position: relative; }
.tb-view { position: absolute; inset: 0; display: none; min-height: 0; }
.tb-view.on { display: flex; flex-direction: column; }

/* ---------- 时间块 ---------- */
.tb-tb { flex: 1; min-height: 0; display: flex; }
.tb-tb-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.tb-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; overflow-anchor: auto; }
.tb-scroll::-webkit-scrollbar { width: 9px; }
.tb-scroll::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 5px; border: 3px solid var(--rail); }
.tb-days { position: relative; }
.tb-day { position: relative; display: flex; }
.tb-day + .tb-day { border-top: 1px dashed var(--dash); }
.tb-gutter { width: 46px; flex: none; position: relative; }
.tb-datemark { position: absolute; left: 6px; top: 5px; display: flex; flex-direction: column; gap: 1px; pointer-events: none; }
.tb-datemark .m { font-size: 9.5px; color: var(--txt-3); letter-spacing: .3px; }
.tb-datemark .d { font-size: 21px; line-height: 1.05; font-weight: 600; color: var(--txt); font-variant-numeric: tabular-nums; letter-spacing: -.2px; }
.tb-datemark .w { font-size: 9.5px; color: var(--txt-2); }
.tb-datemark .t { font-size: 9.5px; color: var(--txt-4); }
.tb-datemark .t.today { color: var(--accent); }
.tb-hours { width: 22px; flex: none; position: relative; }
.tb-hours span { position: absolute; right: 5px; font-size: 10px; color: var(--txt-3); font-variant-numeric: tabular-nums; letter-spacing: -.1px; }
.tb-hours span.now { color: var(--txt); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
.tb-grid { flex: 1; position: relative; min-width: 0; }
.tb-cells { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(6, 1fr); }
.tb-cell { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); cursor: crosshair; }
.tb-cell:nth-child(6n) { border-right: 0; }
.tb-cell.hourlast { border-bottom: 1px solid var(--line-2); }
.tb-cell:hover { background: var(--rail-3); }
.tb-blocks, .tb-sel { position: absolute; inset: 0; pointer-events: none; }
.tb-blk { position: absolute; overflow: hidden; display: flex; align-items: center; padding: 0 4px;
  font-size: 10px; font-weight: 600; letter-spacing: .1px; color: #fff; white-space: nowrap; }
.tb-blk span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-selbox { position: absolute; box-shadow: inset 0 0 0 2px var(--sel-ring); }
.tb-selbox i { position: absolute; top: 0; bottom: 0; display: grid; place-items: center; }
.tb-selbox i svg { width: 12px; height: 12px; color: var(--sel-ink); }
.tb-nowline { position: absolute; width: 2px; background: var(--txt); box-shadow: 0 0 0 .5px rgba(0, 0, 0, .45); }
.tb-jump { position: absolute; right: 12px; bottom: 12px; height: 27px; padding: 0 11px; border-radius: 14px;
  border: 1px solid var(--line-2); background: var(--rail-2); color: var(--txt-2); font-size: 11.5px;
  box-shadow: var(--shadow-sm); opacity: 0; pointer-events: none; transition: opacity .16s; z-index: 5; }
.tb-jump.on { opacity: 1; pointer-events: auto; }

/* ---------- 类别列（标签架） ---------- */
.tb-shelf { width: var(--tb-shelf-width, 118px); flex: none; display: flex; flex-direction: column; min-height: 0; }
.tb-shelf.mini { width: 34px; }
.tb-shelf-head { flex: none; height: 30px; display: flex; align-items: center; gap: 4px; padding: 0 8px;
  color: var(--txt-3); font-size: 10.5px; text-align: left; }
.tb-shelf-head:hover { color: var(--txt-2); }
.tb-shelf-head svg { width: 12px; height: 12px; flex: none; }
.tb-shelf.mini .tb-shelf-head { justify-content: center; padding: 0; }
.tb-shelf.mini .tb-shelf-head span, .tb-shelf.mini .tb-shelf-list, .tb-shelf.mini .tb-shelf-more { display: none; }
.tb-shelf-list { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 7px 8px; display: flex; flex-direction: column; gap: 5px; scrollbar-width: none; }
.tb-shelf-more { flex: none; height: 30px; color: var(--txt-3); font-size: 11px; text-align: left; padding: 0 14px; }
.tb-shelf-more:hover { color: var(--txt-2); }
.tb-brush { width: 20px; height: 20px; border-radius: 4px; margin: 6px auto 0; }
.tb-cat { flex: none; height: 33px; border-radius: 5px; color: #fff; font-size: 12px; font-weight: 600;
  letter-spacing: .2px; padding: 0 8px; display: flex; align-items: center; gap: 5px; text-align: left;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07); transition: filter .12s; }
.tb-cat:hover { filter: brightness(1.07); }
.tb-cat.sub { height: 28px; font-size: 11px; margin-left: 7px; }
.tb-cat .caret { margin-left: auto; width: 10px; height: 10px; opacity: .65; transition: transform .15s; }
.tb-cat[aria-expanded="true"] .caret { transform: rotate(90deg); }
.tb-cat span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---------- 底部状态栏 ---------- */
.tb-status { flex: none; display: flex; align-items: center; gap: 8px; height: var(--tb-status-height, 36px); padding: 0 8px 0 12px;
  border-top: 1px solid var(--line-2); background: var(--rail-2); font-size: 12px; color: var(--txt-2); }
.tb-status b { color: var(--txt); font-weight: 600; font-variant-numeric: tabular-nums; }
.tb-status .grow { flex: 1; }
.tb-sb { height: 24px; border-radius: 6px; color: var(--txt-2); font-size: 11.5px; padding: 0 8px;
  display: inline-flex; align-items: center; gap: 5px; }
.tb-sb[hidden] { display: none; }
.tb-sb:hover { background: var(--rail-3); color: var(--txt); }
.tb-sb.erase { color: var(--danger); }
.tb-sb.erase:hover { background: color-mix(in srgb, var(--danger) 14%, transparent); }
.tb-sb svg { width: 13px; height: 13px; }
.tb-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--txt); }
.tb-chip i { width: 9px; height: 9px; border-radius: 2px; }

/* ---------- 一级抽屉 ---------- */
.tb-scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, .42); opacity: 0; pointer-events: none;
  transition: opacity .2s; z-index: 20; }
.tb-scrim.on { opacity: 1; pointer-events: auto; }
.tb-drawer { position: absolute; left: 0; top: 0; bottom: 0; width: 232px; z-index: 21; background: var(--rail-2);
  border-right: 1px solid var(--line); padding: 14px 10px; display: flex; flex-direction: column;
  transform: translateX(-101%); transition: transform .26s cubic-bezier(.32, .72, 0, 1); box-shadow: var(--shadow); }
.tb-drawer.on { transform: none; }
.tb-drawer .cap { font-size: 10.5px; color: var(--txt-4); padding: 2px 10px 10px; letter-spacing: .4px; }
.tb-mrow { flex: none; width: 100%; height: 40px; border-radius: 8px; color: var(--txt-2); font-size: 14px;
  display: flex; align-items: center; gap: 11px; padding: 0 10px; text-align: left; }
.tb-mrow:hover { background: var(--rail-3); color: var(--txt); }
.tb-mrow.on { color: var(--txt); background: var(--accent-soft); }
.tb-mrow svg { width: 17px; height: 17px; flex: none; color: var(--txt-3); }
.tb-mrow.on svg { color: var(--accent); }
.tb-dsep { flex: none; height: 1px; background: var(--line); margin: 7px 10px; }

/* ---------- 二级菜单 ---------- */
.tb-smenu { position: absolute; z-index: 22; min-width: 172px; padding: 5px; border-radius: 10px; background: var(--rail-3);
  border: 1px solid var(--line-2); box-shadow: var(--shadow); opacity: 0; transform: translateY(-4px) scale(.98);
  pointer-events: none; transition: opacity .14s, transform .14s; transform-origin: top left; }
.tb-smenu.on { opacity: 1; transform: none; pointer-events: auto; }
.tb-smenu button { width: 100%; height: 32px; border-radius: 6px; color: var(--txt-2); font-size: 13px;
  display: flex; align-items: center; gap: 7px; padding: 0 8px; text-align: left; }
.tb-smenu button:hover { background: var(--rail-2); color: var(--txt); }
.tb-smenu button.on { color: var(--txt); font-weight: 600; }
.tb-smenu button svg { width: 12px; height: 12px; color: var(--accent); opacity: 0; }
.tb-smenu button.on svg { opacity: 1; }

/* ---------- 编辑浮层 ---------- */
.tb-sheet { position: absolute; left: 0; right: 0; bottom: 0; z-index: 23; background: var(--rail-2);
  border-top: 1px solid var(--line); border-radius: 14px 14px 0 0; box-shadow: var(--shadow);
  padding: 8px 12px 14px; max-height: 76%; overflow-y: auto;
  transform: translateY(101%); transition: transform .24s cubic-bezier(.32, .72, 0, 1); }
.tb-sheet.on { transform: none; }
.tb-sheet .grab { width: 34px; height: 4px; border-radius: 2px; background: var(--line-2); margin: 0 auto 11px; }
.tb-sheet .row { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
.tb-sheet .time { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.tb-sheet .dur { font-size: 11px; color: var(--txt-3); background: var(--rail-3); border-radius: 4px; padding: 1px 6px; }
.tb-sheet .grow { flex: 1; }
.tb-step { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--line-2); color: var(--txt-2);
  font-size: 14px; line-height: 1; padding: 0; }
.tb-step:hover { background: var(--rail-3); color: var(--txt); }
.tb-picks { display: flex; flex-wrap: wrap; gap: 5px; margin: 0 0 10px; }
.tb-picks button { height: 25px; border-radius: 5px; padding: 0 9px; font-size: 11.5px; color: #fff; opacity: .5; }
.tb-picks button.on { opacity: 1; box-shadow: inset 0 0 0 2px #fff, 0 0 0 2px var(--accent); }
.tb-note { width: 100%; height: 30px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--rail-3);
  color: var(--txt); font-size: 12.5px; padding: 0 9px; margin-bottom: 10px; }
.tb-note::placeholder { color: var(--txt-4); }
.tb-acts { display: flex; gap: 8px; }
.tb-btn { height: 31px; flex: 1; border-radius: 7px; border: 1px solid var(--line-2); background: var(--rail-3); color: var(--txt); font-size: 13px; }
.tb-btn.primary { background: var(--txt); color: var(--rail); border-color: transparent; font-weight: 600; }
.tb-btn.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }

/* ---------- toast ---------- */
.tb-toast { position: absolute; left: 50%; bottom: 16px; transform: translate(-50%, 6px); z-index: 30;
  background: var(--rail-3); border: 1px solid var(--line-2); border-radius: 8px; padding: 7px 13px;
  font-size: 12px; color: var(--txt); box-shadow: var(--shadow-sm); opacity: 0; pointer-events: none;
  transition: all .16s; max-width: 86%; }
.tb-toast.on { opacity: 1; transform: translate(-50%, 0); }

/* ---------- 深度时间 ---------- */
.tb-deep { flex: 1; min-height: 0; display: flex; }
.tb-deep-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.tb-deep-head { flex: none; height: 26px; display: flex; padding-left: 30px; border-bottom: 1px solid var(--line-2); }
.tb-deep-head .d { flex: 1; display: grid; place-items: center; font-size: 10.5px; color: var(--txt-3); }
.tb-deep-head .d.today { color: var(--accent); font-weight: 600; }
.tb-deep-body { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.tb-deep-hours { width: 30px; flex: none; position: relative; }
.tb-deep-hours span { position: absolute; right: 6px; font-size: 9.5px; color: var(--txt-4); font-variant-numeric: tabular-nums; }
.tb-deep-cols { flex: 1; display: flex; min-width: 0; position: relative; touch-action: none; background: var(--rail-3); }
.tb-deep-col { flex: 1; min-width: 0; position: relative; }
.tb-hc { position: absolute; left: 0; right: 0; background: var(--cell); cursor: crosshair; box-shadow: 0 0 0 1px var(--rail-3); }
.tb-hc:hover { filter: brightness(1.12); }
.tb-hc.H { background: color-mix(in srgb, var(--tb-deep-high, #6fbf73) 52%, var(--cell)); }
.tb-hc.M { background: color-mix(in srgb, var(--tb-deep-medium, #e0c04a) 40%, var(--cell)); }
.tb-hc.L { background: color-mix(in srgb, var(--tb-deep-low, #9aa0ac) 32%, var(--cell)); }
.tb-deep-status { flex: none; display: flex; align-items: center; gap: 8px; height: var(--tb-status-height, 36px); padding: 0 8px 0 12px;
  border-top: 1px solid var(--line-2); background: var(--rail-2); font-size: 12px; color: var(--txt-2); }
.tb-deep-status b { color: var(--txt); font-weight: 600; }
`
