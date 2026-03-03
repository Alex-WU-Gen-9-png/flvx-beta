# Session Context

Session ID: ses_34e68d081ffeyr3uWQwm5venHp
Commit Message: 实施

## Prompts

### Prompt 1

211任务中，如果选择了指定的入口IP或者出口IP，在节点上应该只监听这个IP地址，而不再是[::]，请检查

### Prompt 2

connectIp 同时用于“上游拨号目标 + 本节点监听绑定”

### Prompt 3

实施

## Summary

已实施完成，并且按你确认的语义实现为：`connectIp` 同时用于“上游拨号目标 + 本节点监听绑定”。

- 转发服务下发现在会优先使用 `forward_port.in_ip` 作为监听地址，不再固定用节点默认 `[::]`。
- 隧道服务下发现在会优先使用 `connectIp` 作为监听地址；为空时才回退到节点默认监听地址。
- IPv6 监听地址统一通过 `processServerAddress(...)` 处理，确保带方括号格式正确。

改动位置：
- `go-backend/internal/http/handler/control_plane.go:284`
- `go-backend/internal/http/handler/control_plane.go:1306`
- `go-backend/internal/http/handler/mutations.go:2646`

新增测试：
- `go-backend/internal/http/handler/control_plane_test.go:69`
- `go-backend/internal/http/handler/control_plane_test.go:86`
- `go-backend/internal/http/handler/dual_stack_test.go:33`
- `go-backend/internal/http/handler/dual_stack_test.go:49`

验证结果：
- 已运行 `go test ./internal/http/handler/...`，全部通过。
