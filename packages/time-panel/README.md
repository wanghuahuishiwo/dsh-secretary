# dsh-secretary-time-panel

独立“小秘书-时间块”产品包。Host 拥有 `TimeProductService` 与 `secretaryTime` Typert Remote namespace；当前曳光弹只公开 `readWindow` 与 `paint`，调用既有 TimeService／TagService，不直接访问 SQLite。

`./typert` 与 `./remote` 是官方生成入口；`./types` 是浏览器安全词汇；`./client` 在自己的生命周期 `$mount()` 本包 Remote contribution，并在 child Context 注册右栏 UI。签名变化后从仓库根运行 `pnpm generate:typert`，再构建本包。

本切片不拥有 GTD API，也不替代旧 `dsh-secretary-panel`。
