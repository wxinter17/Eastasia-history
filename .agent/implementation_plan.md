# 迭代升级计划

## 📌 已完成的改进 (Phase 1)

### 1. 版本控制与缓存系统 ✅

#### 双轨版本号策略
| 版本类型 | 位置 | 格式 | 用途 |
|---------|------|------|------|
| **语义版本号** | `<title>` 标签 | vX.XX (如 v5.01) | 人类可读，显示在"关于项目" |
| **技术版本号** | `window.APP_VERSION` | YYYY.MM.DD.NNN | 缓存控制，自动刷新资源 |

#### 当前版本号 (2026-01-04)
| 文件 | 语义版本 | 技术版本 |
|------|---------|---------|
| `index.html` | v5.01 | 2026.01.04.003 |
| `map.html` | v16.01 | 2026.01.04.003 |
| `panorama.html` | v11.01 | 2026.01.04.003 |
| `LayoutOptimizer.html` | v11.01 | 2026.01.04.003 |

#### 缓存破坏策略 (Cache Busting)
| 资源类型 | 策略 | 理由 |
|---------|------|------|
| **代码文件** (HTML, JS, Worker) | `?v=APP_VERSION` | 只在发布时变化，利用浏览器缓存 |
| **数据文件** (CSV, JSON) | `?t=Date.now()` | 随时可能变化，需要最新数据 |
| **iframe** (map.html, panorama.html) | `?v=APP_VERSION` | 代码文件，动态设置 src |

#### 资源版本号使用位置
```
index.html
├── iframe src           → ?v=APP_VERSION (动态设置)
└── APP_CONFIG.withVersion() 工具函数

LayoutOptimizer.html
├── Web Worker           → ?v=APP_VERSION
├── CSV 数据获取          → ?t=Date.now()
└── layout.json 获取      → ?t=Date.now()

panorama.html
└── layout.json 获取      → ?t=Date.now()
```

---

### 2. 安全加固 ✅

#### SRI 安全哈希
为关键 CDN 资源添加了 Subresource Integrity 哈希：
- React / ReactDOM
- PapaParse
- Leaflet CSS

#### postMessage 安全修复
- 将所有 iframe 通信的 `targetOrigin` 从 `'*'` 改为 `window.location.origin`
- 涉及文件：`index.html` (5处), `map.html` (2处), `panorama.html` (2处)
- 消除了跨站脚本攻击 (XSS) 风险

---

### 3. 性能优化 ✅

#### 移除 Babel
- 手动将 `LayoutOptimizer.html` 中的 200+ 行 JSX 转换为 `React.createElement`
- 减少了 ~800KB 的首屏加载体积
- 脚本立即执行，无需编译等待

#### 增强的缓存清理
`index.html` 中的 `clearCache()` 函数清理：
- localStorage
- IndexedDB (EastAsiaHistoryDB, EastAsiaLayoutDB)
- Service Worker 缓存
- 版本号缓存

---

### 4. 架构优化 ✅

#### 全局 AppState + 单向数据流
- 在 `EastAsiaApp` 中建立单一数据源 `state` 对象
- 核心API：`setState()`, `subscribe()`, `getState()`
- URL持久化：`syncStateToURL()`, `restoreStateFromURL()`
- 单向数据流：子iframe请求 → 父页面更新 → 广播
- 核心状态字段：`year`, `selectedRegime`, `locked`, `focusMode`

#### 架构原则
- ✅ 单一数据源：`index.html`的`AppState`是唯一真相
- ✅ 单向数据流：UI只订阅，事件只请求修改
- ✅ URL可分享：支持浏览器前进后退和URL分享
- ✅ iframe隔离：父主子副，状态通过postMessage同步

#### 政权选择设计决策
- 政权选择**保持本地状态**，不迁移到 AppState
- 跨视图联动通过**显式跳转按钮**实现

---

### 5. Layout Optimizer 修复 ✅

#### 空布局输出 Bug 修复
- **问题**：导出的 layout.json 包含空数组，色块全部消失
- **根因**：主线程错误地使用 Worker 返回的整数 `masterSeqs` 进行渲染
- **修复**：使用字符串 `layout` 更新状态和渲染

#### 渐进式恢复系统
优化模拟退火的逃逸策略，避免过度破坏解的质量：

| 策略 | 权重 | 说明 |
|---|---|---|
| A: Targeted Repair | 35% | 智能修复 |
| B: Reheat | 25% | 温度重置 |
| C: Column Shuffle | 20% | 列打乱 + 渐进式恢复 |
| D: Multi-Col Swap | 20% | 跨列交换 + 渐进式恢复 |

**恢复规则**：
- 分数下降 >30%: 立即 Jump to Best
- 10,000 次后 <90%: Jump to Best
- 20,000 次后 <95%: Jump to Best
- 30,000 次后 <100%: Jump to Best

---

### 6. 数据同步与校验系统 ✅ (Phase 1.5)

#### 完成日期
2025-12-31

#### layout.json 版本管理
| 功能 | 说明 |
|------|------|
| **自动版本号** | 导出时自动生成时间戳版本号 |
| **版本比较** | IndexedDB vs layout.json 版本对比 |
| **智能加载** | 优先使用最新版本的数据 |

#### 缓存策略简化
从三层缓存（localStorage + IndexedDB + 静态文件）简化为两层：
- **IndexedDB**：持久化缓存
- **layout.json**：静态备份

#### CSV-Layout 数据一致性校验

| 检查项 | 处理方式 | 用户反馈 |
|--------|---------|---------|
| **新增政权** | 检测 CSV 中有但 layout 缺失的政权 | 开发模式：弹窗警告<br>生产环境：控制台警告 |
| **移除政权** | 检测 layout 中有但 CSV 已删除的政权 | 静默处理，自动忽略 |
| **数据完整性** | 差异统计与报告 | 日志输出 |

**实现位置**：`LayoutOptimizer.html` 的 CSV 加载逻辑

#### 错误处理增强
- CSV 加载失败时的开发者提示
- layout.json 格式错误的容错处理
- IndexedDB 操作失败的降级方案

---

### 7. SA 算法稳定性与性能优化 ✅ (Phase 1.6)

#### 完成日期
2026-01-05

#### 核心问题：分数幻觉修复

**问题根源**：
1. **动态权重机制**：基于 density 的三套权重配置
   - density < 0.2 → 低密度权重
   - 0.2 ≤ density ≤ 0.8 → 默认权重  
   - density > 0.8 → 高密度权重
2. **边界不稳定**：density 在 0.2 附近波动导致权重跳变
3. **缓存污染**：Burst 评估循环破坏 `pairScores` / `stabilityScores` 缓存

**症状**：
- 同一布局在不同时刻得到不同分数（152038 vs 151206）
- 导出后重新加载，分数发生变化
- 增量计算和全量计算结果不一致

**修复方案**：

| 层面 | 修复措施 | 效果 |
|------|---------|------|
| **权重机制** | 锁定为固定值（默认配置） | 消除动态跳变 |
| **缓存机制** | 新增 `calculateScoreOnly()` | Burst 评估不污染缓存 |
| **验证机制** | 三重验证（恢复时、返回前、定期自修复） | 确保分数真实性 |

**固定权重配置**：
```javascript
stability: 50,
continuity: 0.1,
adjacency: 2.0,
gap: 0.2
```

**真实分数**：151206（修复前的 152038 是幻觉分数）

---

#### SA 温度参数全面优化

| 参数 | 修改前 | 修改后 | 提升效果 |
|------|--------|--------|---------|
| **初始温度** | 20.0 | **80.0** | 4倍探索能力 |
| **最低温度** | 0.1 | **0.01** | 更充分退火 |
| **卡住阈值** | 20,000 | **10,000** | 2倍响应速度 |
| **检查频率** | 5,000 | **2,000** | 2.5倍检测频率 |
| **Strategy B 重热** | 5° / 10° | **50° / 100°** | 10倍逃逸能力 |
| **C/D 失败重热** | 8° | **20°** | 2.5倍扰动强度 |

---

#### 策略 A 升级：Combined Repair

**原实现**（策略权重 35%）：
- 单一 `targetedRepair`（Gap 修复）
- 按列顺序逐个尝试

**新实现**（策略权重 25%）：
```
Strategy A: Combined Repair
├── Phase 1: targetedRepair (Gap 修复)
│   └── 如果成功 → 更新 bestScore，结束
└── Phase 2: stabilityRepair (Shift 修复)
    ├── 全局收集所有列的位移问题
    ├── 按严重程度全局排序
    ├── 修复前 10 个最严重问题
    └── 细粒度缓存 (colId:regimeId:bestScore)
```

**stabilityRepair 核心算法**：
1. 计算每个政权在不同年份的"相对位置"
2. 计算 shift = max(位置) - min(位置)
3. 筛选 shift ≥ 0.2 的问题政权
4. 全局排序，取前 10 个
5. 对每个问题，穷举所有可能位置，选最优

**失败缓存机制**：
- 缓存键：`colId:regimeId:bestScore`
- 避免重复尝试已知失败的修复
- `bestScore` 改变时自动清空缓存

---

#### 策略权重再平衡

| 策略 | 原权重 | 新权重 | 说明 |
|------|--------|--------|------|
| A: Combined Repair | 35% | **25%** | 功能增强后降低频率 |
| B: Random Reheat | 25% | **25%** | 维持 |
| C: Column Shuffle | 20% | **25%** | 增加探索机会 |
| D: Block Move | 20% | **25%** | 增加探索机会 |

**策略 C/D 简化**：
- 移除"渐进式恢复"逻辑（过于复杂）
- 改为"立即接受/拒绝"模式
- Burst 尝试：C 进行 200 次，D 进行 50 次
- 只接受 `newScore > bestScore` 的结果

---

#### 代码质量提升

| 改进项 | 说明 | 影响 |
|--------|------|------|
| **删除死代码** | 移除 `_precomputeContinuityMatrix` | 减少 ~60 行 |
| **边界安全** | Block Move 边界条件加强 | 避免无效操作 |
| **空值检查** | `bestSeqs` 存在性校验 | 提高鲁棒性 |
| **手动编辑修复** | 修复序列编辑功能 | 功能可用 |
| **calculateScoreOnly** | 新增不修改缓存的评分函数 | 关键修复 |

---

## 🔜 下一阶段 (Phase 2)

### 消息类型语义化
- [ ] 定义 `STATE_PATCH` 消息格式（增量更新）
- [ ] 定义 `STATE_SYNC` 消息格式（全量同步）
- [ ] 规范 iframe 通信协议

### AI 研究型输出
- [ ] 设计研究型内容生成接口
- [ ] 实现历史分析辅助工具
- [ ] 集成 AI 驱动的内容建议

### 移动端优化
- [ ] 响应式布局优化
- [ ] 触摸交互增强
- [ ] 性能优化（移动端）

---

## 🔧 维护指南

### 发布新版本时
1. 更新四个 HTML 文件的 `<title>` 中的语义版本号（如 v5.01 → v5.02）
2. 更新四个 HTML 文件的 `window.APP_VERSION`（如 2026.01.04.003 → 2026.01.04.004）
3. 如有 CDN 版本变更，更新 SRI 哈希

### 获取 SRI 哈希
```bash
curl -s https://example.com/lib.js | openssl dgst -sha384 -binary | openssl base64
# 或使用在线工具: https://www.srihash.org/
```

---

## 📝 备注

### @apply 警告
IDE 可能显示 `Unknown at rule @apply` 警告，这是 Tailwind CSS 语法，IDE 不识别但运行时正常，**可以安全忽略**。

---

## 📅 更新日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-01-05 | 1.6 | **SA 算法稳定性**：分数幻觉修复 + 温度优化 + Combined Repair + 代码质量提升 |
| 2025-12-31 | 1.5 | **数据同步与校验**：layout.json 版本管理 + CSV-Layout 一致性校验 + 缓存策略简化 |
| 2026-01-04 | 003 | Layout Optimizer 修复 + 渐进式恢复 + 版本控制统一 |
| 2026-01-04 | 002 | Babel移除 + postMessage安全 + AppState单向数据流 |
| 2026-01-04 | 001 | 版本机制 + SRI + 缓存优化 |

