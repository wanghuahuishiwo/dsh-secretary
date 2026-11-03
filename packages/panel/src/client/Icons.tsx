/** Inline icon sprite copied from the accepted prototype; `Icon` references it by symbol id. */
export function IconSprite() {
  return <svg className="svg-sprite" aria-hidden="true"><defs>
    <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
    <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></symbol>
    <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></symbol>
    <symbol id="i-pencil" viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3" /></symbol>
    <symbol id="i-chevron-left" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></symbol>
    <symbol id="i-chevron-right" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></symbol>
    <symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></symbol>
    <symbol id="i-undo" viewBox="0 0 24 24"><path d="M9 7H5v4M5.5 11a7.5 7.5 0 1 1 1.8 6" /></symbol>
    <symbol id="i-tags" viewBox="0 0 24 24"><path d="M20 13l-7 7-9-9V4h7l9 9z" /><circle cx="8.5" cy="8.5" r="1.2" /></symbol>
    <symbol id="i-drag" viewBox="0 0 24 24"><circle cx="9" cy="7" r="1" /><circle cx="15" cy="7" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="17" r="1" /><circle cx="15" cy="17" r="1" /></symbol>
    <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7V5z" /></symbol>
    <symbol id="i-stop" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></symbol>
  </defs></svg>
}

/** Render one sprite symbol at the shared 16px icon size. */
export function Icon({ name }: { name: string }) {
  return <svg className="icon" aria-hidden="true"><use href={`#i-${name}`} /></svg>
}
