/**
 * The product shell's stylesheet: one narrow column that behaves like the
 * iPhone 时间块 app. Every colour comes from a host token, so light and dark
 * follow the DSH theme instead of defining a palette here.
 */
export const productStyles = `.sec-shell {
  position: relative;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-1, #151517);
  color: var(--dsw-alias-label-primary, #ececef);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.45;

  --rail: var(--dsw-alias-bg-layer-1, #151517);
  --rail-2: var(--dsw-alias-bg-layer-2, #1b1b1e);
  --rail-3: var(--dsw-alias-bg-module-platform, #212125);
  --cell: var(--dsw-alias-bg-layer-2, #2b2b31);
  --line: var(--dsw-alias-border-l2, rgba(255, 255, 255, .09));
  --line-2: var(--dsw-alias-border-l3, rgba(255, 255, 255, .14));
  --dash: var(--dsw-alias-border-l3, #4f4f57);
  --txt: var(--dsw-alias-label-primary, #ececef);
  --txt-2: var(--dsw-alias-label-secondary, #a2a2aa);
  --txt-3: var(--dsw-alias-label-tertiary, #71717a);
  --txt-4: var(--dsw-alias-label-caption, #55555d);
  --accent: var(--dsw-alias-link, #5b8def);
  --accent-soft: var(--dsw-alias-interactive-bg-hover-accent, rgba(91, 141, 239, .18));
  --danger: var(--dsw-alias-state-error-primary, #e0554b);
  --sel-ring: var(--dsw-alias-label-primary, #ffffff);
  --sel-ink: var(--dsw-alias-label-primary, #101014);
  --shadow: 0 14px 38px rgba(0, 0, 0, .38);
  --shadow-sm: 0 6px 18px rgba(0, 0, 0, .28);
}
.sec-shell *, .sec-shell *::before, .sec-shell *::after { box-sizing: border-box; }
.sec-shell button, .sec-shell input, .sec-shell textarea { font: inherit; color: inherit; }
.sec-shell button { background: none; border: 0; cursor: pointer; }
.sec-shell :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

/* ---------- header ---------- */
.sec-head { flex: none; height: 42px; display: flex; align-items: center; gap: 2px; padding: 0 8px; }
.sec-hbtn { width: 28px; height: 28px; border-radius: 7px; color: var(--txt-2); display: grid; place-items: center; padding: 0; }
.sec-hbtn:hover { background: var(--rail-3); color: var(--txt); }
.sec-hbtn:disabled { opacity: .28; cursor: default; }
.sec-hbtn:disabled:hover { background: none; color: var(--txt-2); }
.sec-hbtn svg { width: 16px; height: 16px; }
.sec-title { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 7px 0 8px; border-radius: 7px;
  color: var(--txt); font-size: 14.5px; font-weight: 600; letter-spacing: .1px; }
.sec-title:hover { background: var(--rail-3); }
.sec-title .tsub { font-weight: 500; font-size: 12.5px; color: var(--txt-3); }
.sec-title .tsub:not(:empty)::before { content: "· "; }
.sec-daylabel { height: 24px; padding: 0 8px; border-radius: 6px; color: var(--txt); font-size: 12.5px;
  font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sec-daylabel:hover { background: var(--rail-3); }
.sec-now { height: 24px; padding: 0 8px; border-radius: 6px; color: var(--txt-3); font-size: 11.5px; }
.sec-now:hover { background: var(--rail-3); color: var(--txt); }

/* ---------- 自绘日历（时间块选天 / 深度时间选周） ---------- */
.sec-picker { position: absolute; right: 2px; top: 44px; z-index: 24; width: 258px; padding: 8px;
  border-radius: 10px; background: var(--rail-2); border: 1px solid var(--line-2); box-shadow: var(--shadow); }
.sec-picker-head { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
.sec-picker-title { flex: 1; text-align: center; font-size: 12.5px; font-weight: 600; color: var(--txt); }
.sec-picker-nav { width: 24px; height: 24px; border-radius: 6px; color: var(--txt-3); display: grid; place-items: center; padding: 0; }
.sec-picker-nav:hover { background: var(--rail-3); color: var(--txt); }
.sec-picker-nav svg { width: 12px; height: 12px; }
.sec-picker-weekdays, .sec-picker-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
.sec-picker-weekdays { margin-bottom: 2px; }
.sec-picker-weekdays span { text-align: center; font-size: 10px; color: var(--txt-4); padding: 3px 0; }
.sec-picker-grid button { height: 28px; border-radius: 5px; color: var(--txt-2); font-size: 12px;
  font-variant-numeric: tabular-nums; }
.sec-picker-grid button:hover { background: var(--rail-3); color: var(--txt); }
.sec-picker-grid button.out { color: var(--txt-4); opacity: .5; }
.sec-picker-grid button.today { color: var(--accent); font-weight: 700; }
.sec-picker-grid button.on { background: var(--accent); color: #fff; font-weight: 600; }
.sec-picker-grid button.on.today { color: #fff; }
.sec-picker-grid button.wstart { border-radius: 5px 0 0 5px; }
.sec-picker-grid button.wend { border-radius: 0 5px 5px 0; }
.sec-picker-grid button.wstart.wend { border-radius: 5px; }
.sec-picker-foot { display: flex; align-items: center; gap: 6px; margin-top: 6px; padding-top: 6px;
  border-top: 1px solid var(--line); font-size: 10.5px; color: var(--txt-4); }
.sec-picker-now { margin-left: auto; height: 22px; padding: 0 8px; border-radius: 5px; color: var(--accent); font-size: 11.5px; }
.sec-picker-now:hover { background: var(--accent-soft); }
.sec-title svg { width: 11px; height: 11px; color: var(--txt-3); transition: transform .16s; }
.sec-title[aria-expanded="true"] svg { transform: rotate(180deg); }
.sec-head .grow { flex: 1; }

/* ---------- views ---------- */
.sec-views { flex: 1; min-height: 0; position: relative; }
.sec-view { position: absolute; inset: 0; display: none; min-height: 0; }
.sec-view.on { display: flex; flex-direction: column; }

/* ---------- 时间块 ---------- */
.sec-tb { flex: 1; min-height: 0; display: flex; }
.sec-tb-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.sec-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; overflow-anchor: auto; }
.sec-scroll::-webkit-scrollbar { width: 9px; }
.sec-scroll::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 5px; border: 3px solid var(--rail); }
.sec-days { position: relative; }
.sec-day { position: relative; display: flex; }
.sec-day + .sec-day { border-top: 1px dashed var(--dash); }
.sec-gutter { width: 46px; flex: none; position: relative; }
.sec-datemark { position: absolute; left: 6px; top: 5px; display: flex; flex-direction: column; gap: 1px; pointer-events: none; }
.sec-datemark .m { font-size: 9.5px; color: var(--txt-3); letter-spacing: .3px; }
.sec-datemark .d { font-size: 21px; line-height: 1.05; font-weight: 600; color: var(--txt); font-variant-numeric: tabular-nums; letter-spacing: -.2px; }
.sec-datemark .w { font-size: 9.5px; color: var(--txt-2); }
.sec-datemark .t { font-size: 9.5px; color: var(--txt-4); }
.sec-datemark .t.today { color: var(--accent); }
.sec-hours { width: 22px; flex: none; position: relative; }
.sec-hours span { position: absolute; right: 5px; font-size: 10px; color: var(--txt-3); font-variant-numeric: tabular-nums; letter-spacing: -.1px; }
.sec-hours span.now { color: var(--txt); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
.sec-grid { flex: 1; position: relative; min-width: 0; }
.sec-cells { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(6, 1fr); }
.sec-cell { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); cursor: crosshair; }
.sec-cell:nth-child(6n) { border-right: 0; }
.sec-cell.hourlast { border-bottom: 1px solid var(--line-2); }
.sec-cell:hover { background: var(--rail-3); }
.sec-blocks, .sec-sel { position: absolute; inset: 0; pointer-events: none; }
.sec-blk { position: absolute; overflow: hidden; display: flex; align-items: center; padding: 0 4px;
  font-size: 10px; font-weight: 600; letter-spacing: .1px; color: #fff; white-space: nowrap; }
.sec-blk span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sec-selbox { position: absolute; box-shadow: inset 0 0 0 2px var(--sel-ring); }
.sec-selbox i { position: absolute; top: 0; bottom: 0; display: grid; place-items: center; }
.sec-selbox i svg { width: 12px; height: 12px; color: var(--sel-ink); }
.sec-nowline { position: absolute; width: 2px; background: var(--txt); box-shadow: 0 0 0 .5px rgba(0, 0, 0, .45); }
.sec-jump { position: absolute; right: 12px; bottom: 12px; height: 27px; padding: 0 11px; border-radius: 14px;
  border: 1px solid var(--line-2); background: var(--rail-2); color: var(--txt-2); font-size: 11.5px;
  box-shadow: var(--shadow-sm); opacity: 0; pointer-events: none; transition: opacity .16s; z-index: 5; }
.sec-jump.on { opacity: 1; pointer-events: auto; }

/* ---------- 类别列（标签架） ---------- */
.sec-shelf { width: 118px; flex: none; display: flex; flex-direction: column; min-height: 0; }
.sec-shelf.mini { width: 34px; }
.sec-shelf-head { flex: none; height: 30px; display: flex; align-items: center; gap: 4px; padding: 0 8px;
  color: var(--txt-3); font-size: 10.5px; text-align: left; }
.sec-shelf-head:hover { color: var(--txt-2); }
.sec-shelf-head svg { width: 12px; height: 12px; flex: none; }
.sec-shelf.mini .sec-shelf-head { justify-content: center; padding: 0; }
.sec-shelf.mini .sec-shelf-head span, .sec-shelf.mini .sec-shelf-list, .sec-shelf.mini .sec-shelf-more { display: none; }
.sec-shelf-list { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 7px 8px; display: flex; flex-direction: column; gap: 5px; scrollbar-width: none; }
.sec-shelf-more { flex: none; height: 30px; color: var(--txt-3); font-size: 11px; text-align: left; padding: 0 14px; }
.sec-shelf-more:hover { color: var(--txt-2); }
.sec-brush { width: 20px; height: 20px; border-radius: 4px; margin: 6px auto 0; }
.sec-cat { flex: none; height: 33px; border-radius: 5px; color: #fff; font-size: 12px; font-weight: 600;
  letter-spacing: .2px; padding: 0 8px; display: flex; align-items: center; gap: 5px; text-align: left;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07); transition: filter .12s; }
.sec-cat:hover { filter: brightness(1.07); }
.sec-cat.sub { height: 28px; font-size: 11px; margin-left: 7px; }
.sec-cat .caret { margin-left: auto; width: 10px; height: 10px; opacity: .65; transition: transform .15s; }
.sec-cat[aria-expanded="true"] .caret { transform: rotate(90deg); }
.sec-cat span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---------- 底部状态栏 ---------- */
.sec-status { flex: none; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px 0 12px;
  border-top: 1px solid var(--line-2); background: var(--rail-2); font-size: 12px; color: var(--txt-2); }
.sec-status b { color: var(--txt); font-weight: 600; font-variant-numeric: tabular-nums; }
.sec-status .grow { flex: 1; }
.sec-sb { height: 24px; border-radius: 6px; color: var(--txt-2); font-size: 11.5px; padding: 0 8px;
  display: inline-flex; align-items: center; gap: 5px; }
.sec-sb[hidden] { display: none; }
.sec-sb:hover { background: var(--rail-3); color: var(--txt); }
.sec-sb.erase { color: var(--danger); }
.sec-sb.erase:hover { background: color-mix(in srgb, var(--danger) 14%, transparent); }
.sec-sb svg { width: 13px; height: 13px; }
.sec-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--txt); }
.sec-chip i { width: 9px; height: 9px; border-radius: 2px; }

/* ---------- 一级抽屉 ---------- */
.sec-scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, .42); opacity: 0; pointer-events: none;
  transition: opacity .2s; z-index: 20; }
.sec-scrim.on { opacity: 1; pointer-events: auto; }
.sec-drawer { position: absolute; left: 0; top: 0; bottom: 0; width: 232px; z-index: 21; background: var(--rail-2);
  border-right: 1px solid var(--line); padding: 14px 10px; display: flex; flex-direction: column;
  transform: translateX(-101%); transition: transform .26s cubic-bezier(.32, .72, 0, 1); box-shadow: var(--shadow); }
.sec-drawer.on { transform: none; }
.sec-drawer .cap { font-size: 10.5px; color: var(--txt-4); padding: 2px 10px 10px; letter-spacing: .4px; }
.sec-mrow { flex: none; width: 100%; height: 40px; border-radius: 8px; color: var(--txt-2); font-size: 14px;
  display: flex; align-items: center; gap: 11px; padding: 0 10px; text-align: left; }
.sec-mrow:hover { background: var(--rail-3); color: var(--txt); }
.sec-mrow.on { color: var(--txt); background: var(--accent-soft); }
.sec-mrow svg { width: 17px; height: 17px; flex: none; color: var(--txt-3); }
.sec-mrow.on svg { color: var(--accent); }
.sec-dsep { flex: none; height: 1px; background: var(--line); margin: 7px 10px; }

/* ---------- 二级菜单 ---------- */
.sec-smenu { position: absolute; z-index: 22; min-width: 172px; padding: 5px; border-radius: 10px; background: var(--rail-3);
  border: 1px solid var(--line-2); box-shadow: var(--shadow); opacity: 0; transform: translateY(-4px) scale(.98);
  pointer-events: none; transition: opacity .14s, transform .14s; transform-origin: top left; }
.sec-smenu.on { opacity: 1; transform: none; pointer-events: auto; }
.sec-smenu button { width: 100%; height: 32px; border-radius: 6px; color: var(--txt-2); font-size: 13px;
  display: flex; align-items: center; gap: 7px; padding: 0 8px; text-align: left; }
.sec-smenu button:hover { background: var(--rail-2); color: var(--txt); }
.sec-smenu button.on { color: var(--txt); font-weight: 600; }
.sec-smenu button svg { width: 12px; height: 12px; color: var(--accent); opacity: 0; }
.sec-smenu button.on svg { opacity: 1; }

/* ---------- 编辑浮层 ---------- */
.sec-sheet { position: absolute; left: 0; right: 0; bottom: 0; z-index: 23; background: var(--rail-2);
  border-top: 1px solid var(--line); border-radius: 14px 14px 0 0; box-shadow: var(--shadow);
  padding: 8px 12px 14px; max-height: 76%; overflow-y: auto;
  transform: translateY(101%); transition: transform .24s cubic-bezier(.32, .72, 0, 1); }
.sec-sheet.on { transform: none; }
.sec-sheet .grab { width: 34px; height: 4px; border-radius: 2px; background: var(--line-2); margin: 0 auto 11px; }
.sec-sheet .row { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
.sec-sheet .time { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.sec-sheet .dur { font-size: 11px; color: var(--txt-3); background: var(--rail-3); border-radius: 4px; padding: 1px 6px; }
.sec-sheet .grow { flex: 1; }
.sec-step { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--line-2); color: var(--txt-2);
  font-size: 14px; line-height: 1; padding: 0; }
.sec-step:hover { background: var(--rail-3); color: var(--txt); }
.sec-picks { display: flex; flex-wrap: wrap; gap: 5px; margin: 0 0 10px; }
.sec-picks button { height: 25px; border-radius: 5px; padding: 0 9px; font-size: 11.5px; color: #fff; opacity: .5; }
.sec-picks button.on { opacity: 1; box-shadow: inset 0 0 0 2px #fff, 0 0 0 2px var(--accent); }
.sec-note { width: 100%; height: 30px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--rail-3);
  color: var(--txt); font-size: 12.5px; padding: 0 9px; margin-bottom: 10px; }
.sec-note::placeholder { color: var(--txt-4); }
.sec-acts { display: flex; gap: 8px; }
.sec-btn { height: 31px; flex: 1; border-radius: 7px; border: 1px solid var(--line-2); background: var(--rail-3); color: var(--txt); font-size: 13px; }
.sec-btn.primary { background: var(--txt); color: var(--rail); border-color: transparent; font-weight: 600; }
.sec-btn.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }

/* ---------- toast ---------- */
.sec-toast { position: absolute; left: 50%; bottom: 16px; transform: translate(-50%, 6px); z-index: 30;
  background: var(--rail-3); border: 1px solid var(--line-2); border-radius: 8px; padding: 7px 13px;
  font-size: 12px; color: var(--txt); box-shadow: var(--shadow-sm); opacity: 0; pointer-events: none;
  transition: all .16s; max-width: 86%; }
.sec-toast.on { opacity: 1; transform: translate(-50%, 0); }

/* ---------- 深度时间 ---------- */
.sec-deep { flex: 1; min-height: 0; display: flex; }
.sec-deep-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.sec-deep-head { flex: none; height: 26px; display: flex; padding-left: 30px; border-bottom: 1px solid var(--line-2); }
.sec-deep-head .d { flex: 1; display: grid; place-items: center; font-size: 10.5px; color: var(--txt-3); }
.sec-deep-head .d.today { color: var(--accent); font-weight: 600; }
.sec-deep-body { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.sec-deep-hours { width: 30px; flex: none; position: relative; }
.sec-deep-hours span { position: absolute; right: 6px; font-size: 9.5px; color: var(--txt-4); font-variant-numeric: tabular-nums; }
.sec-deep-cols { flex: 1; display: flex; min-width: 0; position: relative; touch-action: none; background: var(--rail-3); }
.sec-deep-col { flex: 1; min-width: 0; position: relative; }
.sec-hc { position: absolute; left: 0; right: 0; background: var(--cell); cursor: crosshair; box-shadow: 0 0 0 1px var(--rail-3); }
.sec-hc:hover { filter: brightness(1.12); }
.sec-hc.H { background: color-mix(in srgb, #6fbf73 52%, var(--cell)); }
.sec-hc.M { background: color-mix(in srgb, #e0c04a 40%, var(--cell)); }
.sec-hc.L { background: color-mix(in srgb, #9aa0ac 32%, var(--cell)); }
.sec-deep-status { flex: none; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px 0 12px;
  border-top: 1px solid var(--line-2); background: var(--rail-2); font-size: 12px; color: var(--txt-2); }
.sec-deep-status b { color: var(--txt); font-weight: 600; }
`
