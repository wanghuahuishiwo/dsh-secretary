// wayfinder #70 官方引擎 spike（在 DSH 会话里经 workflow 工具实跑成功的那一版）
// 关键事实：脚本按纯 JS 用 vm.Script 编译，写 TS 类型注解会 SCRIPT_PARSE。
const ev = args.event
phase('SourceScope')
const scope = {
  source: ev.source,
  kind: ev.kind,
  inScope: ev.source === 'aone' && ev.kind === 'bug',
}
log('scope resolved: ' + JSON.stringify(scope))

phase('Gate')
const gate = { pass: scope.inScope && ev.status === 'afk', reasons: [] }
if (!scope.inScope) gate.reasons.push('source out of scope')
if (ev.status !== 'afk') gate.reasons.push('ticket not afk')
log('gate: ' + JSON.stringify(gate))

phase('Assessment')
let assessment = null
if (gate.pass) {
  assessment = await agent(
    '你是 Agent 调度中心的 Assessment 节点。有一个 aone bug 事件，判断：priority（P1/P2/P3）、route（worker=可 AFK 派 coding worker 直接修；hitl=必须等人调研；ignore=无需处理）、reason。\n\n事件：' + JSON.stringify(ev),
    {
      label: 'assessment',
      schema: {
        type: 'object',
        properties: {
          priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
          route: { type: 'string', enum: ['worker', 'hitl', 'ignore'] },
          reason: { type: 'string' },
        },
        required: ['priority', 'route', 'reason'],
        additionalProperties: false,
      },
    },
  )
  log('assessment: ' + JSON.stringify(assessment))
}

phase('Decision')
const decision = assessment && gate.pass
  ? { assignment: assessment.route === 'worker' ? 'coding-worker' : assessment.route, basis: assessment.reason }
  : { assignment: 'drop', basis: gate.reasons.join('; ') || 'gate failed' }
return { scope, gate, assessment, decision }
