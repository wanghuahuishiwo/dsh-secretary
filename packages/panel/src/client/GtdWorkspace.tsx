import { useState } from 'react'
import type { ActionView, InboxItem, Project, ProjectStatus, ProjectType } from 'dsh-secretary-gtd/contract'
import type { Tag } from 'dsh-secretary-tag/contract'
import type { PanelCommand } from './api.ts'

type GtdView = 'inbox' | 'clarify' | 'projects' | 'next' | 'forecast'

interface Props {
  readonly tags: readonly Tag[]
  readonly inbox: readonly InboxItem[]
  readonly projects: readonly Project[]
  readonly actions: readonly ActionView[]
  readonly nextActions: readonly ActionView[]
  readonly forecast: readonly ActionView[]
  readonly forecastDate: string
  readonly onForecastDateChange: (date: string) => void
  readonly busy: boolean
  readonly run: (command: PanelCommand) => Promise<boolean>
}

interface ActionEditorState {
  readonly id?: number
  readonly projectId?: number
}

function toggle(ids: readonly number[], id: number): number[] {
  return ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]
}

export function GtdWorkspace(props: Props) {
  const { tags, inbox, projects, actions, nextActions, forecast, busy, run } = props
  const [view, setView] = useState<GtdView>('inbox')
  const [captureTitle, setCaptureTitle] = useState('')
  const [captureRaw, setCaptureRaw] = useState('')
  const [clarifyId, setClarifyId] = useState<number>()
  const [clarifyMode, setClarifyMode] = useState<'project' | 'standalone'>('project')
  const [projectTitle, setProjectTitle] = useState('')
  const [projectOutcome, setProjectOutcome] = useState('')
  const [projectType, setProjectType] = useState<ProjectType>('parallel')
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>('active')
  const [projectTagIds, setProjectTagIds] = useState<number[]>([])
  const [projectEditorId, setProjectEditorId] = useState<number | null | undefined>(undefined)
  const [actionTitle, setActionTitle] = useState('')
  const [actionNote, setActionNote] = useState('')
  const [actionTagIds, setActionTagIds] = useState<number[]>([])
  const [deferAt, setDeferAt] = useState('')
  const [plannedAt, setPlannedAt] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [estimatedMinutes, setEstimatedMinutes] = useState('')
  const [actionEditor, setActionEditor] = useState<ActionEditorState>()

  const tagName = (id: number) => tags.find(tag => tag.id === id)?.name ?? `tag:${id}`
  const effectiveNames = (action: ActionView) => [...action.effectiveTags].sort((a, b) => a - b).map(tagName).join('、')
  const resetActionForm = () => {
    setActionTitle(''); setActionNote(''); setActionTagIds([])
    setDeferAt(''); setPlannedAt(''); setDueAt(''); setEstimatedMinutes('')
  }
  const startClarify = (item: InboxItem) => {
    setClarifyId(item.id)
    setClarifyMode('project')
    setProjectTitle(item.title)
    setProjectOutcome('')
    setProjectType('parallel')
    setProjectTagIds([])
    resetActionForm()
    setActionTitle(item.title)
    setView('clarify')
  }
  const startProjectEditor = (project?: Project) => {
    setProjectEditorId(project?.id ?? null)
    setProjectTitle(project?.title ?? '')
    setProjectOutcome(project?.outcome ?? '')
    setProjectType(project?.type ?? 'parallel')
    setProjectStatus(project?.status ?? 'active')
    setProjectTagIds([...(project?.tagIds ?? [])])
  }
  const startActionEditor = (action?: ActionView, projectId?: number) => {
    setActionEditor({ id: action?.id, projectId: action?.projectId ?? projectId })
    setActionTitle(action?.title ?? '')
    setActionNote(action?.note ?? '')
    setActionTagIds([...(action?.tagIds ?? [])])
    setDeferAt(action?.deferAt ?? '')
    setPlannedAt(action?.plannedAt ?? '')
    setDueAt(action?.dueAt ?? '')
    setEstimatedMinutes(action?.estimatedMinutes === undefined ? '' : String(action.estimatedMinutes))
  }
  const complete = async (action: ActionView) => {
    await run({ domain: 'gtd', op: 'action.complete', id: action.id, completedAt: new Date().toISOString() })
  }
  const submitClarify = async () => {
    if (clarifyId === undefined) return
    const action = {
      title: actionTitle, note: actionNote || undefined, tagIds: actionTagIds,
      deferAt: deferAt || undefined, plannedAt: plannedAt || undefined, dueAt: dueAt || undefined,
      estimatedMinutes: estimatedMinutes === '' ? undefined : Number(estimatedMinutes),
    }
    const project = clarifyMode === 'project' ? {
      title: projectTitle, outcome: projectOutcome || undefined, type: projectType, tagIds: projectTagIds,
    } : undefined
    const ok = await run({ domain: 'gtd', op: 'inbox.clarify', id: clarifyId, project, action })
    if (ok) {
      setClarifyId(undefined)
      resetActionForm()
      setView('next')
    }
  }
  const submitProject = async () => {
    const input = {
      title: projectTitle, outcome: projectOutcome || (projectEditorId !== null && projectType === 'single_action_list' ? null : undefined),
      type: projectType, tagIds: projectTagIds,
    }
    const ok = projectEditorId === null
      ? await run({ domain: 'gtd', op: 'project.create', ...input })
      : projectEditorId !== undefined && await run({ domain: 'gtd', op: 'project.update', id: projectEditorId, status: projectStatus, ...input })
    if (ok) setProjectEditorId(undefined)
  }
  const submitAction = async () => {
    if (actionEditor === undefined) return
    const input = {
      title: actionTitle, note: actionNote, tagIds: actionTagIds,
      deferAt: deferAt || null, plannedAt: plannedAt || null, dueAt: dueAt || null,
      estimatedMinutes: estimatedMinutes === '' ? null : Number(estimatedMinutes),
    }
    const ok = actionEditor.id === undefined
      ? await run({ domain: 'gtd', op: 'action.create', projectId: actionEditor.projectId, ...input,
        deferAt: deferAt || undefined, plannedAt: plannedAt || undefined, dueAt: dueAt || undefined,
        estimatedMinutes: estimatedMinutes === '' ? undefined : Number(estimatedMinutes) })
      : await run({ domain: 'gtd', op: 'action.update', id: actionEditor.id, ...input })
    if (ok) setActionEditor(undefined)
  }

  const tagChoices = (prefix: string, selected: readonly number[], change: (ids: number[]) => void) => <div className="gtd-tag-choices">
    {tags.map(tag => <label key={tag.id}>
      <input type="checkbox" aria-label={`${prefix} ${tag.name}`} checked={selected.includes(tag.id)} onChange={() => change(toggle(selected, tag.id))} />
      <span className="tag-dot" style={{ background: tag.color ?? '#477bc7' }} />{tag.kind === 'time' ? '时间' : '情境'} · {tag.name}
    </label>)}
  </div>

  const actionRow = (action: ActionView) => <article className="gtd-action-row" key={action.id}>
    <div className="gtd-action-main">
      <strong>{action.title}</strong>
      <span className="gtd-action-meta">action:{action.id} · {action.status} · {action.availability}</span>
      <span className="gtd-action-meta">有效 Tags：{effectiveNames(action) || '无'}</span>
      <span className="gtd-action-meta">{[
        action.deferAt && `Defer ${action.deferAt}`, action.plannedAt && `Planned ${action.plannedAt}`,
        action.dueAt && `Due ${action.dueAt}`, action.estimatedMinutes && `${action.estimatedMinutes} 分钟`,
      ].filter(Boolean).join(' · ')}</span>
    </div>
    <div className="gtd-row-actions">
      <button type="button" onClick={() => startActionEditor(action)}>编辑 {action.title}</button>
      {action.status === 'active' && <button type="button" disabled={busy} onClick={() => void complete(action)}>完成 {action.title}</button>}
    </div>
  </article>

  return <section className="gtd-workspace" aria-label="GTD 工作区">
    <div className="gtd-tabs" role="tablist" aria-label="GTD 视图">
      {([['inbox', 'Inbox'], ['clarify', '澄清'], ['projects', 'Projects'], ['next', 'Next Actions'], ['forecast', 'Forecast']] as const).map(([id, label]) =>
        <button type="button" role="tab" key={id} aria-selected={view === id} onClick={() => setView(id)}>{label}</button>)}
    </div>

    {view === 'inbox' && <section className="gtd-section" aria-label="Inbox 视图">
      <div className="gtd-section-title"><strong>Inbox</strong><span>先原样捕获，再单独澄清</span></div>
      <div className="gtd-capture-form">
        <label>捕获标题<input value={captureTitle} onChange={event => setCaptureTitle(event.target.value)} /></label>
        <label>捕获原文<textarea value={captureRaw} onChange={event => setCaptureRaw(event.target.value)} /></label>
        <button type="button" disabled={busy || !captureTitle.trim() || !captureRaw.trim()} onClick={async () => {
          const ok = await run({ domain: 'gtd', op: 'inbox.capture', title: captureTitle, raw: captureRaw, source: 'browser' })
          if (ok) { setCaptureTitle(''); setCaptureRaw('') }
        }}>捕获到 Inbox</button>
      </div>
      <div className="gtd-list">{inbox.map(item => <article className="gtd-inbox-row" key={item.id}>
        <div><strong>{item.title}</strong><p>{item.raw}</p><small>inbox:{item.id} · {item.source}</small></div>
        <button type="button" onClick={() => startClarify(item)}>澄清 {item.title}</button>
        <button type="button" disabled={busy} onClick={() => void run({ domain: 'gtd', op: 'inbox.delete', id: item.id })}>删除 {item.title}</button>
      </article>)}</div>
      {inbox.length === 0 && <p className="empty-note">Inbox 已清空。</p>}
    </section>}

    {view === 'clarify' && <section className="gtd-section" aria-label="澄清视图">
      <div className="gtd-section-title"><strong>澄清</strong><span>选择独立 Action，或 Project + 首个 Action</span></div>
      {clarifyId === undefined ? <div className="gtd-list">{inbox.map(item => <button type="button" key={item.id} onClick={() => startClarify(item)}>澄清 {item.title}</button>)}</div>
        : <div className="gtd-clarify-form">
          <label>澄清为<select value={clarifyMode} onChange={event => setClarifyMode(event.target.value as 'project' | 'standalone')}>
            <option value="project">Project + Action</option><option value="standalone">独立 root Action</option>
          </select></label>
          {clarifyMode === 'project' && <fieldset><legend>Project</legend>
            <label>Project 标题<input value={projectTitle} onChange={event => setProjectTitle(event.target.value)} /></label>
            {projectType !== 'single_action_list' && <label>Project Outcome<input value={projectOutcome} onChange={event => setProjectOutcome(event.target.value)} /></label>}
            <label>Project 类型<select value={projectType} onChange={event => setProjectType(event.target.value as ProjectType)}>
              <option value="parallel">parallel</option><option value="sequential">sequential</option><option value="single_action_list">single_action_list</option>
            </select></label>
            <span className="gtd-field-label">Project 直接 Tags（恰好一个 time）</span>
            {tagChoices('Project 标签', projectTagIds, setProjectTagIds)}
          </fieldset>}
          <fieldset><legend>Action</legend>
            <label>Action 标题<input value={actionTitle} onChange={event => setActionTitle(event.target.value)} /></label>
            <label>Action 备注<textarea value={actionNote} onChange={event => setActionNote(event.target.value)} /></label>
            {tagChoices('Action 标签', actionTagIds, setActionTagIds)}
            <div className="gtd-date-grid">
              <label>Action Defer At<input value={deferAt} placeholder="带 offset 的时刻" onChange={event => setDeferAt(event.target.value)} /></label>
              <label>Action Planned At<input value={plannedAt} placeholder="2026-11-03T09:00:00+08:00" onChange={event => setPlannedAt(event.target.value)} /></label>
              <label>Action Due At<input value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
              <label>Estimated Minutes<input type="number" min="1" value={estimatedMinutes} onChange={event => setEstimatedMinutes(event.target.value)} /></label>
            </div>
          </fieldset>
          <button type="button" disabled={busy || !actionTitle.trim()} onClick={() => void submitClarify()}>完成澄清</button>
        </div>}
    </section>}

    {view === 'projects' && <section className="gtd-section" aria-label="Projects 视图">
      <div className="gtd-section-title"><strong>Projects</strong><div>
        <button type="button" onClick={() => startProjectEditor()}>新建 Project</button>
        <button type="button" onClick={() => startActionEditor()}>新建独立 Action</button>
      </div></div>
      {projects.map(project => <article className="gtd-project" key={project.id}>
        <header><div><strong>{project.title}</strong><span>project:{project.id} · {project.type} · {project.status}</span>{project.outcome && <p>{project.outcome}</p>}</div>
          <button type="button" onClick={() => startProjectEditor(project)}>编辑 {project.title}</button>
          <button type="button" onClick={() => startActionEditor(undefined, project.id)}>添加 Action 到 {project.title}</button></header>
        <div>{actions.filter(action => action.projectId === project.id).map(actionRow)}</div>
      </article>)}
      {actions.some(action => action.projectId === undefined) && <article className="gtd-project"><header><strong>独立 Actions</strong></header>{actions.filter(action => action.projectId === undefined).map(actionRow)}</article>}
    </section>}

    {view === 'next' && <section className="gtd-section" aria-label="Next Actions 视图">
      <div className="gtd-section-title"><strong>Next Actions</strong><span>仅当前可用的叶子 Action</span></div>
      {nextActions.map(actionRow)}
      {nextActions.length === 0 && <p className="empty-note">当前没有可用下一步。</p>}
    </section>}

    {view === 'forecast' && <section className="gtd-section" aria-label="Forecast 视图">
      <div className="gtd-section-title"><strong>Forecast</strong><label>Forecast 日期<input type="date" value={props.forecastDate} onChange={event => props.onForecastDateChange(event.target.value)} /></label></div>
      <p className="gtd-forecast-note">按所选日期派生 Defer／Planned／Due，不保存 Projection。</p>
      {forecast.map(actionRow)}
      {forecast.length === 0 && <p className="empty-note">这一天没有相关日期的事项。</p>}
    </section>}

    {projectEditorId !== undefined && <div className="editor-backdrop" role="dialog" aria-label="编辑 Project">
      <label>Project 标题<input value={projectTitle} onChange={event => setProjectTitle(event.target.value)} /></label>
      {projectType !== 'single_action_list' && <label>Project Outcome<input value={projectOutcome} onChange={event => setProjectOutcome(event.target.value)} /></label>}
      <label>Project 类型<select value={projectType} onChange={event => setProjectType(event.target.value as ProjectType)}><option value="parallel">parallel</option><option value="sequential">sequential</option><option value="single_action_list">single_action_list</option></select></label>
      {projectEditorId !== null && <label>Project Status<select value={projectStatus} onChange={event => setProjectStatus(event.target.value as ProjectStatus)}><option value="active">active</option><option value="on-hold">on-hold</option><option value="completed">completed</option><option value="dropped">dropped</option></select></label>}
      {tagChoices('Project 编辑标签', projectTagIds, setProjectTagIds)}
      <div className="editor-actions"><button type="button" onClick={() => setProjectEditorId(undefined)}>取消</button><button type="button" disabled={busy} onClick={() => void submitProject()}>保存 Project</button></div>
    </div>}

    {actionEditor !== undefined && <div className="editor-backdrop" role="dialog" aria-label="编辑 Action">
      <label>Action 标题<input value={actionTitle} onChange={event => setActionTitle(event.target.value)} /></label>
      <label>Action 备注<textarea value={actionNote} onChange={event => setActionNote(event.target.value)} /></label>
      {tagChoices('Action 编辑标签', actionTagIds, setActionTagIds)}
      <label>Defer At<input value={deferAt} onChange={event => setDeferAt(event.target.value)} /></label>
      <label>Planned At<input value={plannedAt} onChange={event => setPlannedAt(event.target.value)} /></label>
      <label>Due At<input value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
      <label>Estimated Minutes<input type="number" min="1" value={estimatedMinutes} onChange={event => setEstimatedMinutes(event.target.value)} /></label>
      <div className="editor-actions"><button type="button" onClick={() => setActionEditor(undefined)}>取消</button><button type="button" disabled={busy} onClick={() => void submitAction()}>保存 Action</button></div>
    </div>}
  </section>
}
