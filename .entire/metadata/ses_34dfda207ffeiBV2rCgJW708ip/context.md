# Session Context

Session ID: ses_34dfda207ffeiBV2rCgJW708ip
Commit Message: 配置下发也没兼容，请全量检查一下，哪些功能需要一起改造

## Prompts

### Prompt 1

211 任务的没有完全完成1. 选择IP后诊断还会诊断默认IP
2. 选择隧道出口IP后，入口还是会链接默认IP，没有链接选择的IP
请分析后制定修复计划

### Prompt 2

配置下发也没兼容，请全量检查一下，哪些功能需要一起改造

## Summary

你提得很对，我按“配置下发全链路”重新过了一遍（只读分析）。结论是：**需要一起改造的不是一个点，而是“诊断链路 + 重部署链路 + 回归测试链路”**。

目前状态可以分成三类：

- **已兼容（创建/更新时下发）**
  - 隧道创建/更新时，`connectIp` 已进入运行时下发选择逻辑（`selectTunnelDialHost`）。
  - 本地/联邦 runtime apply 都会吃 `target.ConnectIP`（前提是 state 里有值）。
  - 参考：`go-backend/internal/http/handler/mutations.go:2588`, `go-backend/internal/http/handler/mutations.go:2348`

- **未兼容（你反馈的核心问题）**
  - 诊断链路未传 `connectIp`，导致总走默认IP。
  - 参考：`go-backend/internal/http/handler/control_plane.go:75`, `go-backend/internal/http/handler/control_plane.go:1102`

- **半兼容（配置重建时丢字段）**
  - 重部署时从 DB 重建 runtime state，**没把 `ConnectIP` 带回去**，所以 redeploy 后会回退默认IP。
  - 参考：`go-backend/internal/http/handler/mutations.go:883`, `go-backend/internal/http/handler/mutations.go:897`

---

**需要一起改造的功能范围（建议一次性做完）**

- `诊断（非流式 + 流式）`
  - 隧道诊断、转发诊断都要改（共用 `prepare*Diagnosis` + `appendChainHopDiagnosis`）。
  - 流式 start 预览项也要改，否则 UI 一开始仍显示默认IP。
  - 目标文件：`go-backend/internal/http/handler/control_plane.go`, `go-backend/internal/http/handler/diagnosis_stream.go`

- `配置下发（重部署路径）`
  - 单条重部署、批量重部署都依赖 `reconstructTunnelState`，必须补 `ConnectIP` 回填。
  - 目标文件：`go-backend/internal/http/handler/mutations.go`

- `联邦节点运行时下发一致性`
  - 逻辑本身已支持 `ConnectIP`，但受上一步 state 丢字段影响；修复后自动恢复一致。
  - 重点验证：remote middle hop `ApplyRole.Targets` 的 Host 选取。

- `回归测试`
  - 新增诊断用例：选了 `connectIp` 后，`targetIp` 必须是选中值（tunnel/forward + stream start/item）。
  - 新增重部署用例：redeploy 后仍使用 `connectIp`，不回退默认IP。
  - 目标文件建议：`go-backend/tests/contract/diagnosis_contract_test.go`，补 handler 级或 contract 级 redeploy 用例。

---

**实施计划（修复包）**

1. 修 `diagnosis` 调用链：所有 `resolveChainProbeTarget` 调用传入 `workItem.toNode.ConnectIP`。  
2. 修 `reconstructTunnelState`：出口节点和中继节点都回填 `ConnectIP`。  
3. 补测试：覆盖“诊断用选中IP”“重部署不丢IP”“connectIp为空仍走默认”的三组场景。  
4. 联调验证：创建/更新、诊断、单重部署、批量重部署、联邦节点场景各跑一遍。

---

我建议按这个范围做成一次完整修复（避免只修诊断后你再次遇到“重部署又回退”的问题）。  
如果你同意，我下一步就按这个“全量改造范围”进入实施。
