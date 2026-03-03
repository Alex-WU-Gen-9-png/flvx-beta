# Session Context

Session ID: ses_34ec18cadffeoVVSjfPXGJaxBu
Commit Message: 再做一轮“跨表全量列对比（model vs 旧库补列逻辑）

## Prompts

### Prompt 1

211任务全量再逐一确认一下是否全部完成，并且功能完成

### Prompt 2

添加额外ip的时候报错：SQL logic error: no such column: extra_ips (1)

### Prompt 3

全量排查一下还有没有类似的bug

### Prompt 4

再做一轮“跨表全量列对比（model vs 旧库补列逻辑）

## Summary

已完成这一轮“跨表全量列对比（model vs 旧库补列逻辑）”，并做了可执行验证。

我做了什么：

- 对比了 `model.Node` / `model.Tunnel` 字段与 `prepareSQLiteLegacyColumns` 的补列清单。
- 结论：
  - `Node` 目前应补的历史增量列：`server_ip_v4`, `server_ip_v6`, `extra_ips`, `tcp_listen_addr`, `udp_listen_addr`, `inx`, `is_remote`, `remote_url`, `remote_token`, `remote_config`
  - `Tunnel` 应补：`inx`, `ip_preference`
- 我已把这个对齐结果固化为回归测试，新增了一个“更老版本库”场景验证：
  - 新测试：`TestOpenMigratesVeryLegacyNodeAndTunnelColumns`
  - 文件：`go-backend/tests/contract/migration_contract_test.go`
  - 该测试从极简旧表结构启动，验证上述所有列都会被自动补齐。
- 测试结果：通过
  - `go test ./tests/contract -run "TestOpenMigratesLegacyNodeDualStackColumns|TestOpenMigratesVeryLegacyNodeAndTunnelColumns"`

最终结论（本轮排查范围内）：

- **Node/Tunnel 这条旧库升级链路已对齐且有测试兜底**。
- 你这类 “no such column” 的同类风险，针对这两个核心表已经基本封住。
