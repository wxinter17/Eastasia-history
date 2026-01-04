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

## 🔜 下一阶段 (Phase 2)

- [ ] 消息类型语义化：定义 `STATE_PATCH` 和 `STATE_SYNC` 消息格式
- [ ] CSV-Layout 校验增强：自动提示布局失效
- [ ] AI 研究型输出
- [ ] 移动端优化

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
| 2026-01-04 | 003 | Layout Optimizer 修复 + 渐进式恢复 + 版本控制统一 |
| 2026-01-04 | 002 | Babel移除 + postMessage安全 + AppState单向数据流 |
| 2026-01-04 | 001 | 版本机制 + SRI + 缓存优化 |
