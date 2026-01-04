# 迭代升级计划 (Phase 1 Complete)

## 📌 已完成的改进

### 1. 版本号机制 ✅
所有四个核心 HTML 文件都已添加统一的版本号机制：

```javascript
window.APP_VERSION = '2026.01.04.001';
```

**修改的文件**：
- `index.html` (v5.00)
- `map.html` (v16.00)
- `panorama.html` (v11.00)
- `LayoutOptimizer.html` (v11.00)

**版本号格式**：`YYYY.MM.DD.NNN`（日期 + 序号）

**使用方式**：
1. 每次发布新版本时，修改所有文件中的 `APP_VERSION`
2. 浏览器会自动检测版本变化并提示用户

### 2. SRI 安全哈希 ✅
为关键 CDN 资源添加了 Subresource Integrity 哈希，防止 CDN 被篡改：

- React / ReactDOM
- PapaParse
- Leaflet CSS
- Babel (临时)

### 3. 增强的缓存清理 ✅
`index.html` 中的 `clearCache()` 函数现在会清理：
- localStorage
- IndexedDB (EastAsiaHistoryDB, EastAsiaLayoutDB)
- Service Worker 缓存
- 版本号缓存

---

### 4. 移除 Babel (P0) ✅
- **状态**：已完成 (2026-01-04)
- **改动**：
  - 手动将 `LayoutOptimizer.html` 中的 200+ 行 JSX 代码转换为纯 JavaScript (`React.createElement` 别名 `h`)
  - 移除了 `babel-standalone` CDN 引用
  - 将 `<script type="text/babel">` 更改为 `<script>`
- **收益**：
  - 减少了 ~800KB 的首屏加载体积
  - 脚本立即执行，无需编译等待
  - 解决了移动端可能的编译兼容性问题

### 5. postMessage 安全修复 (P1) ✅
- **状态**：已完成 (2026-01-04)
- **改动**：
  - 将所有 iframe 通信的 `targetOrigin` 从 `'*'` 改为 `window.location.origin`
  - 涉及文件：`index.html` (5处), `map.html` (2处), `panorama.html` (2处)
- **收益**：
  - 消除了跨站脚本攻击 (XSS) 风险
  - 符合同源策略最佳实践

### 6. 全局缓存版本查询字符串 (P1) ✅
- **状态**：已完成 (2026-01-04)
- **改动**：
  - 在 `index.html` 和 `LayoutOptimizer.html` 中添加 `APP_CONFIG.withVersion(url)` 辅助函数
  - 自动为资源 URL 附加版本号查询参数 (`?v=2026.01.04.001`)
- **收益**：
  - 确保浏览器在版本更新时加载最新资源
  - 未来 Worker、远程 CSV 等动态资源可使用此机制

### 7. 全局AppState + 单向数据流 (P0) ✅
- **状态**：已完成 (2026-01-04)
- **改动**：
  - 在 `EastAsiaApp` 中建立单一数据源 `state` 对象
  - 实现核心API：`setState()`, `subscribe()`, `getState()`
  - 添加URL持久化：`syncStateToURL()`, `restoreStateFromURL()`
  - 实现单向数据流：子iframe请求(`STATE_UPDATE_REQUEST`) → 父页面更新 → 广播(`STATE_SYNC`)
  - 新增核心状态字段：`year`, `selectedRegime`, `locked`, `focusMode`
  - **完成时间轴迁移**：
    - map.html 瀑布图滚动 → `STATE_UPDATE_REQUEST`
    - panorama.html 滚动 → `STATE_UPDATE_REQUEST`
    - 两个视图通过 AppState 实现年份同步
    - 添加用户滚动检测，避免程序化滚动打断用户操作
    - 实现 150ms/300ms 节流，优化性能
- **架构原则**：
  - ✅ 单一数据源：`index.html`的`AppState`是唯一真相
  - ✅ 单向数据流：UI只订阅，事件只请求修改
  - ✅ URL可分享：支持浏览器前进后退和URL分享
  - ✅ iframe隔离：父主子副，状态通过postMessage同步
- **收益**：
  - 状态可追溯：`console.log(AppState)` 即可理解系统
  - 消除状态冲突：不可能出现UI打架
  - 支持时间旅行：URL包含完整状态快照
  - 易于调试：单向数据流，事件链清晰
  - **视图间同步**：地图和全景的年份自动同步，切换无缝

### 8. 政权选择设计决策 📝
- **状态**：评估完成 (2026-01-04)
- **决策**：政权选择**保持本地状态**，不迁移到 AppState
- **分析**：
  - 地图瀑布图的 `State.lockedRegimeId` 是地图本地状态
  - 全景的 `Core.state.lastClickedGeoCode` 是全景本地状态
  - 两个视图的政权选择是**独立的**，不需要自动互相同步
- **跨视图联动**：
  - 通过**显式跳转按钮**实现（"查看历史全景"、"跳转到地图"）
  - 按钮点击 → `REQUEST_SWITCH` → 切换视图 → `CMD_JUMP` → 定位
- **理由**：
  - ✅ 避免不必要的自动同步打扰用户
  - ✅ 现有显式跳转按钮已满足需求
  - ✅ 保持架构简洁

---

## 🔜 下一阶段：架构优化 (Phase 2)

| 指标 | 改进前 | 改进后 |
|------|--------|--------|
| 首屏加载 (LayoutOptimizer) | ~3-5s | ~3-5s (Babel 仍在) |
| 缓存更新可靠性 | 不可控 | ✅ 版本号控制 |
| CDN 安全性 | 无验证 | ✅ SRI 哈希 |
| 缓存清理范围 | 部分 | ✅ 完整 |

---

## 🔧 维护指南

### 发布新版本时

1. 更新所有文件的 `APP_VERSION`
2. 更新 `<title>` 中的版本号
3. 如有 CDN 版本变更，更新 SRI 哈希

### 获取 SRI 哈希

```bash
# 使用 openssl 计算
curl -s https://example.com/lib.js | openssl dgst -sha384 -binary | openssl base64

# 或使用在线工具
# https://www.srihash.org/
```

---

## 📝 @apply 警告说明

IDE 可能会显示 `Unknown at rule @apply` 警告，这是因为 CSS linter 不识别 Tailwind 的 `@apply` 语法。

**这些警告可以安全忽略**，因为：
1. Tailwind CDN 运行时会正确处理这些指令
2. 这只是 IDE 静态分析的局限性

如果要消除警告，可以将 `@apply` 替换为等效的原生 CSS。

---

## 📅 更新日志

### 2026-01-04
- 添加统一版本号机制
- 添加 SRI 安全哈希
- 增强缓存清理功能
- 创建迭代升级计划文档
