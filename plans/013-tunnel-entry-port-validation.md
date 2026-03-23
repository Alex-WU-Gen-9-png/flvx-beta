# 013 - 隧道入口端口校验不严格修复

## Issue
- GitHub Issue: [#373](https://github.com/Sagit-chu/flvx/issues/373)
- 添加隧道入口时，端口校验不严格 - 默认端口可能不在新入口设置范围内

## 问题分析
当已有隧道上添加新入口节点时，系统会使用既有转发的端口部署到新入口节点上，
但该端口可能不在新入口节点设置的端口范围内，且没有校验提示。

### 根因
`syncTunnelForwardsEntryPorts` 函数在同步入口端口时，直接复用了原有端口，
没有检查该端口是否在新入口节点的允许范围内。

## 修复方案

- [x] 1. 新增 `isPortValidForAllEntryNodes` 辅助方法，校验端口是否在各节点范围内
- [x] 2. 在 `syncTunnelForwardsEntryPorts` 中检测端口超范围时，通过 `pickTunnelPort` 自动随机分配新端口
- [x] 3. 构建通过 + 全量测试通过
