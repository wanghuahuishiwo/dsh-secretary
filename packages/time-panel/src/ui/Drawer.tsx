import { MODULES, type TimeModule } from './TimeHeader.tsx'

interface DrawerProps {
  readonly open: boolean
  readonly module: TimeModule
  readonly onModuleChange: (module: TimeModule) => void
  readonly onClose: () => void
}

/** 一级模块抽屉：时间块 / 深度时间。 */
export function Drawer({ open, module, onModuleChange, onClose }: DrawerProps) {
  return (
    <>
      <div className={`sec-scrim${open ? ' on' : ''}`} onClick={onClose} />
      <nav className={`sec-drawer${open ? ' on' : ''}`}>
        <div className="cap">小秘书</div>
        {MODULES.map(item => (
          <button
            key={item.id} className={`sec-mrow${module === item.id ? ' on' : ''}`} type="button"
            onClick={() => onModuleChange(item.id)}
          >
            {item.icon}
            {item.name}
          </button>
        ))}
      </nav>
    </>
  )
}
