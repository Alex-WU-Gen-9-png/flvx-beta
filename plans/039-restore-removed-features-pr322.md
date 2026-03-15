# 恢复 PR #322 移除的功能

**状态**: ✅ 已完成

## 背景

PR #322 (https://github.com/Sagit-chu/flvx/pull/322) 原本移除了三个功能，用户要求**加回**这些被移除的功能：
1. 批量操作失败详情弹窗（`BatchOperationFailure` 类型及相关处理）
2. 节点到期提醒关闭功能（`dismissNodeExpiryReminder` API）
3. 更新通道选择功能（稳定版/开发版切换）

用户要求**保留**的改动：
- 版本显示简化（移除 "v" 前缀和更新可用徽章）

## 任务清单

- [x] 检出 PR #322 到本地分支 `pr-322`
- [x] 恢复 `api/types.ts` 中的 `expiryReminderDismissed` 字段
- [x] 恢复 `api/types.ts` 中的 `BatchOperationFailure` 类型和 `failures` 字段
- [x] 恢复 `api/error-message.ts` 中的批量操作失败处理函数
- [x] 恢复 `api/index.ts` 中的 `dismissNodeExpiryReminder` API
- [x] 恢复 `config.tsx` 中的更新通道选择功能
- [x] 恢复 `use-dashboard-data.ts` 中的 `expiryReminderDismissed` 过滤逻辑
- [x] 恢复 `batch-actions.ts` 中的 `BatchOperationFailure` 相关处理
- [x] 提交并推送修改

## 修改的文件

- `vite-frontend/src/api/types.ts` - 添加 `expiryReminderDismissed` 和 `BatchOperationFailure`
- `vite-frontend/src/api/error-message.ts` - 添加批量操作失败处理函数
- `vite-frontend/src/api/index.ts` - 添加 `dismissNodeExpiryReminder` API
- `vite-frontend/src/pages/config.tsx` - 添加更新通道选择功能
- `vite-frontend/src/pages/dashboard/use-dashboard-data.ts` - 恢复 `expiryReminderDismissed` 过滤逻辑
- `vite-frontend/src/pages/forward/batch-actions.ts` - 恢复批量操作失败处理

## 注意事项

- `version-footer.tsx` 保持简化版本显示（不恢复）
- `batch-action-result-modal.tsx` 未被 PR 修改，无需恢复