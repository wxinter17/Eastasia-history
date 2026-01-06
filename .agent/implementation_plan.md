# Bug修复实施方案 (v2)

## 问题总结
1. **复位后颜色不一致**: 点击右上角复位按钮后，同一大区内的色块颜色深浅不一
2. **地图->全景切换问题**: 地图页打开面板后，点击左上角切换到全景页，全景页没有弹出对应详情面板
3. **全景->地图切换问题**: 全景页打开详情面板后切换到地图页，能看到面板被关闭的动画，最终只剩高亮模式

## 根因分析

### 问题1: 颜色不一致
**原因**: `MapCtrl.getColor(code)` 调用父页面的 `calcColor(code)` 时，没有传递区域名称 `name`。`calcColor` 函数使用 `name` 来微调亮度和饱和度（如"南"偏亮、"北"偏暗）。每次不传 name 时，哈希计算结果可能不稳定，导致同一区域每次重置时颜色略有不同。

**修复**: 修改 `getColor` 函数，从 `State.layers[code].itemData.name` 获取区域名称并传递给 `calcColor`。

### 问题2&3: 切换时状态丢失
**原因**: `PREPARE_VIEW_SWITCH` 消息处理中调用了 `closePanel`/`closeAIPanel`/`clearFocus` 等函数，这些函数会发送 `STATE_UPDATE_REQUEST` 将 `selectedRegimeId` 设为 `null`。这导致父页面的全局状态被清除，后续的 `STATE_SYNC` 同步的就是空状态。

**修复**: 修改 `PREPARE_VIEW_SWITCH` 处理逻辑，只做 UI 层面的清理（隐藏 DOM 元素、移除 CSS 类），不调用那些会发送状态更新的函数。真正的状态变更由 `STATE_SYNC` 处理。

## 修改清单

### map.html
1. `getColor(code)`: 现在传递 `name` 参数给 `calcColor`
2. `deselectAll()`: 清除 `lastActiveRegime`，添加 `invalidateSize` 强制重绘
3. `PREPARE_VIEW_SWITCH` 处理: 只清理模态框，不调用 `closeAIPanel`

### panorama.html
1. `PREPARE_VIEW_SWITCH` 处理: 直接操作 DOM 清理 UI，不调用 `closePanel`/`clearFocus`（避免触发 `STATE_UPDATE_REQUEST`）

### index.html
1. `switchView()`: 发送 `PREPARE_VIEW_SWITCH` 并延迟 300ms 广播 `STATE_SYNC`

## 验证步骤

### 测试1: 复位颜色一致性
1. 打开地图页，点击任意区域打开详情面板
2. 点击面板内的政权触发高亮模式
3. 点击右上角复位按钮
4. ✅ 验证：所有区域颜色均匀，没有深浅不一

### 测试2: 地图->全景同步
1. 在地图页点击某个区域，打开详情面板
2. 在瀑布图中点击某个政权（如"唐"）
3. 点击左上角切换到全景页（不是跳转按钮）
4. ✅ 验证：全景页应自动滚动到对应年份并进入该政权的焦点模式

### 测试3: 全景->地图同步
1. 在全景页点击某个政权进入焦点模式
2. 点击左上角切换到地图页
3. ✅ 验证：地图页应自动打开包含该政权的区域详情面板，并高亮该政权领土
