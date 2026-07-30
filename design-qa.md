# 花海画布设计 QA

日期：2026-07-30
范围：普通画布批量连接、智能画布批量连接、项目管理固定排序

## 对照材料

- 同状态设计/实际对照图：`docs/ui-preview/batch-link-project-qa/00-design-vs-actual-comparison-final.png`
- 普通画布实际图：`docs/ui-preview/batch-link-project-qa/01-normal-canvas-batch-link-actual-final-v2.png`
- 智能画布实际图：`docs/ui-preview/batch-link-project-qa/02-smart-canvas-batch-link-actual-final.png`
- 项目管理实际图：`docs/ui-preview/batch-link-project-qa/03-project-manager-actual-final-v5.png`
- 智能成果与部分兼容状态：`docs/ui-preview/results-rail-qa/smart-results-actual-final.png`

## 验收结果

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| 普通画布批量选区 | 通过 | 选区边框、数量、代理端口、批量检查器和操作按钮均已落地 |
| 智能画布批量选区 | 通过 | 同步批量代理端口；未渲染“智能建议”面板 |
| 部分兼容状态 | 通过 | 明确显示可连接数与冲突数，必须点击“仅连接兼容项”才提交 |
| 项目管理排序 | 通过 | 更新时间从新到旧，左到右、从上到下固定排列，卡片不可拖动 |
| 项目管理倒影 | 通过 | 使用独立、不可交互的轻量倒影，不影响固定网格 |
| 生成成果入口 | 通过 | 智能画布右侧成果分类、拖入画布、复制、素材库、定位均可见 |
| 视觉可读性 | 通过 | 毛玻璃、深海背景、青色边框、珊瑚色主操作及文字对比度符合当前设计体系 |

## 差异说明

- 对照图使用设计示例素材，实际图使用本地画布真实节点与项目，因此节点内容、项目名称和节点位置不同。
- 智能画布保留现有生产工具栏与右侧成果入口，未照搬概念图中用于示意的简化工具栏；这是为保留原项目完整功能入口而做的有意差异。
- 当前剩余差异均为 P3 内容与演示状态差异，无 P0、P1、P2 问题。

## 自动与交互验证

- Pytest：27 项通过。
- JavaScript 语法：`canvas.js`、`smart-canvas.js`、`canvas-list.js`、`canvas-inspector.js`、`huahai-batch-links.js` 通过。
- 普通画布实测：4 个选中节点可找到全部兼容目标，批量检查器 3 个操作按钮均正确派发。
- 智能画布实测：同一选区可得到“2 个兼容、1 个冲突”，确认按钮文案和提交边界正确。
- 页面静态扫描：`static/` 中不存在“智能建议”可见文案。

final result: passed
