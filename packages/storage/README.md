# Secretary Storage

小秘书专用的 `storageDomain` facility。它只把本插件拥有的 domains 路由到 SQLite，避免覆盖宿主全局 `storage-domain` 的默认 backend 或其他 routes。领域术语见仓库 [docs/glossary.md](../../docs/glossary.md)。

## 插件入口

| 入口 | 作用 | `inject` | `Config` |
|---|---|---|---|
| `dsh-secretary-storage` | 提供 `ctx.secretaryStorageDomain` | `['storage', 'storage.backend.sqlite']` | 无配置字段 |

实际 backend service key 由 `storageBackendServiceKey('sqlite')` 生成。SQLite 文件由 `@deepseek-ai/dsh-storage-sqlite` 的 bundle row 配置。

## 数据所有权

- `secretary_gtd` 与 `secretary_time` 通过本 facility 打开，其他 Host domains 不经过它。
- 本模块不直接关闭共享 SQLite backend；卸载时只关闭本 facility 打开的 domains，backend 仍由其 Provider 拥有。
- 不提供跨 domain 事务，也不复制旧 JSON 或 Obsidian 数据。

## 验证

公开工具与真实临时 SQLite 的重开恢复覆盖本包链路；证据见 [verification.md](../../docs/verification.md)。
