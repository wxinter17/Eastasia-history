# 东亚历史交互地图 (East Asia History Interactive Map)

这是一个基于 Web 技术构建的交互式历史地图项目，旨在可视化展示东亚地区（公元前2070年至今）的历史政权疆域演变与地缘政治关系。

## 🌍 项目概览

本项目采用 **"Twin-View" (双视图)** 架构，由一个中心控制台 (`index.html`) 统一调度两个核心视图：
1.  **地图视图 (`map.html`)**: 基于地理坐标的交互式地图，展示特定年份的版图、疆域和政权分布。
2.  **全景视图 (`panorama.html`)**: 基于时间轴的线性全景图，直观展示政权的存续时间、更替关系及所处时代。

两个视图之间保持**实时双向联动**：在地图上点击政权，全景图会自动跳转；拖动全景图时间轴，地图会自动更新年份。

## ✨ 核心功能

*   **双向交互与联动**: 无论操作哪个视图，另一个视图不仅实时响应，还会自动同步高亮状态、年份和选中政权。
*   **沉浸式历史体验**: 
    *   **仿古模式**: 一键切换古地图滤镜，提供沉浸式阅读体验。
    *   **动态图例**: 根据当前视野内的政权动态生成图例。
    *   **智能色彩系统**: 基于 Hash 算法的自适应色彩生成，确保不同政权色彩分明且视觉和谐。
*   **高性能渲染**: 
    *   核心算法优化，支持毫秒级时间轴拖动响应。
    *   统一的父子 iframe 通信总线，降低内存开销。

## 🛠 技术栈

本项目坚持 **KISS (Keep It Simple, Stupid)** 原则，采用无依赖的原生技术栈：

*   **Core**: Vanilla HTML5, CSS3, JavaScript (ES6+)
*   **Map Engine**: Leaflet.js
*   **Data Parsing**: PapaParse (CSV处理)
*   **Architecture**: Iframe-based Micro-frontend (Parent-Child Communication)

**版本信息 (v3.01)**
*   Index Core: v3.01
*   Map Engine: v14.01
*   Panorama Engine: v87.01

## 🚀 快速开始

本项目无需复杂的构建工具（如 Webpack/Vite），开箱通过简单的 HTTP 服务即可运行。

### 方法 1: Python (推荐)

如果您安装了 Python 3：

```bash
# 在项目根目录下运行
python3 -m http.server 8000
```

然后访问: [http://localhost:8000/index.html](http://localhost:8000/index.html)

### 方法 2: VS Code Live Server

安装 VS Code 的 "Live Server" 插件，右键 `index.html` 选择 "Open with Live Server" 即可。

## 📁 目录结构

```
.
├── index.html          # 主控台 (Parent Frame)，负责全局状态管理、工具函数(GlobalUtils)、配置(GLOBAL_CONFIG)
├── map.html            # 地图视图 (Child Frame)，负责地图渲染
├── panorama.html       # 全景视图 (Child Frame)，负责时间轴可视化
├── history_data.csv    # 历史政权数据源
├── china.json          # 基础地理数据 (GeoJSON)
└── backup.sh           # 自动备份脚本
```

## 📝 贡献与维护

目前由单人维护。所有的修改建议请提交 Issue 或 Pull Request。

---
*Last Updated: 2025-12-27*
