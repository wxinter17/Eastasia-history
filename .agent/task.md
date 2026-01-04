# Task List: 东亚历史可视化系统迭代升级

## 📌 阶段一：紧急修复 (Completed: 2026-01-04)

### 基础设施
- [x] **版本号机制** <!-- id: v1 -->
  - 在所有 HTML 文件中添加 `window.APP_VERSION`
  - 实现版本变化检测和缓存策略

- [x] **SRI 安全哈希** <!-- id: v2 -->
  - 为 React, ReactDOM, PapaParse, Leaflet 添加 integrity 属性
  - 防止 CDN 资源被篡改

- [x] **增强缓存清理** <!-- id: v3 -->
  - 扩展 `clearCache()` 函数
  - 支持清理 IndexedDB, Service Worker 缓存, 版本号

### 待办 (可选)
- [x] **Babel 移除** <!-- id: v4 -->
  - 将 JSX 转换为 `React.createElement` (已完成)
  - 移除了 babel-standalone 依赖
  - 显著提升了加载速度

- [x] **安全优化** <!-- id: v5 -->
  - postMessage 安全修复（同源策略）
  - 消除 XSS 风险

- [x] **缓存版本控制** <!-- id: v6 -->
  - 添加 `APP_CONFIG.withVersion()` 辅助函数
  - 支持动态资源版本查询字符串

- [x] **全局AppState + 单向数据流** <!-- id: v7 -->
  - 建立单一数据源架构
  - 实现 setState/subscribe 发布订阅
  - URL持久化和状态恢复
  - 完成父子iframe单向通信协议
  - **完成时间轴迁移**（地图⇄全景年份同步）

---

## 📅 阶段二：功能完善 (Next Steps)

### 设计决策
- [x] **政权选择状态评估** <!-- id: m2 -->
  - **决定：不迁移到 AppState**
  - 各视图独立管理选择状态
  - 跨视图联动通过显式跳转按钮实现

### 架构优化
- [ ] **消息类型语义化** <!-- id: a1 -->
  - 定义 `STATE_PATCH` 和 `STATE_SYNC` 消息格式
  - 统一 postMessage schema

### 性能优化
- [x] **Web Worker 计算** <!-- id: a2 -->
  - 创建 `layout-worker.js`
  - 将 TSP/遗传算法移入 Worker
  - 实现模拟退火优化算法

### 数据一致性
- [ ] **CSV-Layout 校验增强** <!-- id: a3 -->
  - 自动提示布局失效
  - 增量更新机制

### Layout Optimizer 修复 (Completed: 2026-01-04)
- [x] **Debug Empty Layout Output** <!-- id: 3 -->
  - [x] 分析 `generateLayout` 和数据传递机制 <!-- id: 4 -->
  - [x] 修复 `LayoutOptimizer.html` 使用字符串 `layout` 而非整数 `masterSeqs` <!-- id: 5 -->
  - **根因**：Worker 返回整数ID序列，主线程错误地用于渲染导致空布局

- [x] **渐进式恢复系统** <!-- id: 6 -->
  - [x] 实现时间+分数双重保护机制 <!-- id: 7 -->
  - [x] 移除独立的 Strategy E (Jump to Best)，集成到 C/D 策略中 <!-- id: 8 -->
  - **策略权重重新分配**: A=35%, B=25%, C=20%, D=20%
  - **恢复规则**:
    - 分数下降 >30%: 立即 Jump to Best
    - 10k 次后 <90%: Jump to Best
    - 20k 次后 <95%: Jump to Best
    - 30k 次后 <100%: Jump to Best

---

## 📅 阶段三：功能增强 (Future)

- [ ] **AI 研究型输出** <!-- id: f1 -->
- [ ] **关系类型表达** <!-- id: f2 -->
- [ ] **移动端优化** <!-- id: f3 -->
- [ ] **Timeline 变化点** <!-- id: f4 -->

---

## 📦 版本控制系统

### 双轨策略
- **语义版本号** (`<title>` 中): 人类可读，如 v5.01
- **技术版本号** (`APP_VERSION`): 缓存控制，如 2026.01.04.003

### 缓存策略
| 资源类型 | 策略 | 示例 |
|---------|------|------|
| 代码文件 (HTML/JS/Worker) | `?v=APP_VERSION` | 发布时更新 |
| 数据文件 (CSV/JSON) | `?t=Date.now()` | 每次请求最新 |

### 发布检查清单
- [ ] 更新四个 HTML 的 `<title>` 语义版本号
- [ ] 更新四个 HTML 的 `window.APP_VERSION`
- [ ] 更新此文件的版本历史

---

## 📊 版本历史

| 日期 | 版本号 | 主要变更 |
|------|--------|----------|
| 2026-01-04 | 2026.01.04.001 | 版本机制 + SRI + 缓存优化 |
| 2026-01-04 | 2026.01.04.002 | Babel移除 + postMessage安全 + AppState单向数据流 |
| 2026-01-04 | 2026.01.04.003 | Layout Optimizer 修复 + 渐进式恢复系统 + 版本控制统一 |


