# 豆芽待办 · Douya Todo

<div align="center">

![WeChat MiniProgram](https://img.shields.io/badge/WeChat-MiniProgram-07C160?style=for-the-badge&logo=wechat&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Tests](https://img.shields.io/badge/Tests-Passing-success?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**轻量、现代、零后端依赖的纯本地存储微信小程序待办工具**
*A modern, lightweight, and zero-backend-dependency to-do WeChat Mini-Program with offline-first local storage.*

[中文说明](#中文说明) | [English Documentation](#english-documentation)

</div>

---

<a name="中文说明"></a>
## 📖 中文说明

### 🌟 项目简介

**豆芽待办（Douya Todo）** 是一款基于**原生微信小程序框架**构建的现代化待办管理工具。
项目坚持**离线优先（Offline-First）**与**极简零依赖**设计哲学，数据全部持久化存储在手机端微信本地缓存（`wx.setStorageSync`），**不依赖微信云开发、不依赖任何外部服务器或数据库**，完全无需服务器费用，点开即用，隐私安全。

---

### ✨ 核心功能与交互亮点

1. **半屏模态抽屉（Bottom-Sheet Modal）**
   - 告别传统多页面跳转：点击右下角悬浮按钮（FAB）或点击已有待办卡片，即可在当前页面滑出半屏轻量抽屉；
   - 容器尺寸自适应，**坚决零滚动（Zero Scrolling）**，在方寸之间完成标题、描述、紧急度与日期的快速录入。
2. **待办截止日期紧迫度分级（越近越醒目）**
   - 告别传统千篇一律的红色警示，按自然日天数差（$\Delta \text{Days}$）呈现多层次感知：
     - **已逾期**：强警示深红（`#e5484d` / 淡红底加粗），展示具体逾期天数；
     - **今天截止**：炽烈橙红（`#e03e1a` / 暖粉底加粗），今日事今日毕；
     - **明天截止**：暖橙黄色（`#d97706` / 淡黄底），提前预警；
     - **2~3天内**：活力雅致蓝（`#2563eb` / 浅蓝底），清晰温和；
     - **远期日期**：平静中性灰（`#6b7280` / 浅灰底），降低视觉噪音；
     - **已完成**：极低对比淡灰（`#9ca3af`），沉静归档。
3. **GTD 智能多维加权排序算法**
   - **逾期事项最高优先级置顶**：越早逾期越靠前，第一时间火警提醒；
   - **今日与近期待办顺承排列**：结合优先级高低（高 > 中 > 低）有序梯队调度；
   - **已完成项优雅沉底**：勾选后自动下沉，并按完成时间倒序排列。
4. **大热区高意会性语义复选框**
   - 外框升级为 $48\text{rpx}$ 精致圆角方框，**未勾选状态下自带浅灰线稿对勾（✓）**，明确传达“点此打勾”的视觉意会暗示；
   - 外部包裹 $84\text{rpx} \times 84\text{rpx}$ 独立判定热区，杜绝误触卡片正文；
   - 点击伴随微信马达轻微触感震动（`wx.vibrateShort`）与回弹微动效，多巴胺反馈感十足。
5. **卡片左滑操作抽屉（Swipe-Action Drawer）**
   - 列表卡片支持指尖向左轻滑，平滑展开宽度为 $280\text{rpx}$ 的操作栏；
   - 内置翠绿「完成 / 恢复」按钮与警示红「删除」按钮；
   - 具备**手势正交防冲突判定**（不卡纵向滚动）与**排他性展开机制**（滑动新卡片自动复位旧卡片）。
6. **手机系统日历强提醒（100% 离线 · 零后端 · 锁屏响铃）**
   - 深度集成微信小程序原生系统日历接口（`wx.addPhoneCalendar`），支持 iOS / Android 原生日历日程强提醒；
   - 截止日早晨 09:00 准时触发**手机锁屏弹窗与震动响铃**，提醒效果远胜折叠的微信服务号；
   - **终身零月租费、零云端依赖**：不需要开通每月付费的微信云开发，断网环境下依然离线可用；
   - 亦向前兼容微信订阅消息轻量云端模式（可选配置）。
7. **Per-Commit 代码质量预提交门禁系统**
   - 本地内置 6 道全自动门禁脚本（`scripts/quality-gate.js`）与 Git pre-commit 钩子：
     - `[1/6]` JS 语法静态扫描 (`node --check`)
     - `[2/6]` 全量 JSON 配置文件有效性校验
     - `[3/6]` **WXML 模板标签闭合完整性校验**（彻底杜绝漏写 `</view>` 等编译崩溃）
     - `[4/6]` 小程序配置健全性校验（路由存在性、按需注入、打包排除规范）
     - `[5/6]` 自动化核心数据层与排序算法单元测试套件
     - `[6/6]` 代码包单文件体积限制（$\le 200\text{KB}$）

---

### 📂 项目目录结构

```
.
├── app.js                     # 小程序全局生命周期与断网重试监听
├── app.json                   # 小程序全局页面路由与窗口配置（开启 lazyCodeLoading）
├── app.wxss                   # 全局基础样式与调色板变量
├── project.config.json        # 微信开发者工具工程配置（已配置打包/监听过滤）
├── project.miniapp.json       # 多端框架配置
├── sitemap.json               # 微信索引规则
├── config/                    # 配置文件（模板 ID、云环境解耦配置）
│   ├── subscribe.js
│   └── subscribe.example.js
├── cloudfunctions/           # 轻量云函数（免后端服务器）
│   └── todoReminder/          # 定时下发与发完即焚云函数
├── pages/
│   ├── index/                 # 主页：待办列表、左滑抽屉、半屏编辑模态框
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   └── edit/                  # 独立全屏编辑备用页（历史兼容）
├── utils/
│   ├── todo.js                # TodoManager 数据访问层封装（单例、本地缓存 CRUD）
│   ├── date-helper.js         # 日期紧迫度计算、状态分级与智能排序纯函数工具
│   ├── calendar.js            # 手机系统日历强提醒助手（零费用、离线响铃）
│   └── subscribe.js           # 微信订阅消息客户端授权与离线重试同步助手
│   └── quality-gate.js        # 6 道代码质量预提交门禁脚本
├── tests/
│   ├── datastore.test.js      # 本地数据存储与 CRUD 契约单测 (42 项断言)
│   ├── smart-sort.test.js     # 紧迫度分级与 GTD 智能排序算法专项单测
│   ├── calendar.test.js       # 手机系统日历助手专项单测
│   └── subscribe.test.js      # 订阅消息与离线队列容错专项单测
│   └── pre-commit             # Git 提交前自动触发门禁的 Hook
├── LICENSE                    # MIT 开源许可证
└── README.md                  # 本文档
```

---

### 🚀 快速上手与运行

1. **安装微信开发者工具**：前往 [微信官方文档](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 下载对应操作系统的开发者工具。
2. **导入项目**：
   - 打开微信开发者工具，点击「**导入**」；
   - 目录选择当前仓库根目录；
   - AppID：可填入你自己的微信小程序 AppID（也可以在没有 AppID 时选择「测试号」体验全部功能）。
3. **本地编译**：
   - 点击「**编译**」，左侧模拟器即可秒级呈现并完整体验全部待办管理功能。

---

### 🧪 本地测试与代码门禁运行

本项目内置零第三方依赖的轻量单元测试套件（基于 Node.js 原生 Test Runner）：

```bash
# 运行全部单元测试
node --test tests/datastore.test.js tests/smart-sort.test.js

# 运行 6 道全量代码质量门禁
node scripts/quality-gate.js
```

---

### 💾 本地数据存储与隔离说明

| 指标 | 说明 |
| :--- | :--- |
| **存储 Key** | `bean_todo_items_v1`（保存在微信客户端安全沙箱本地缓存中） |
| **持久性** | 只要不主动卸载小程序或在微信存储管理中深度清空缓存，数据永久保留在手机上 |
| **隐私隔离** | 微信本地缓存按「小程序 AppID + 手机本地用户」严格物理隔离，外界无法读取 |
| **上限容量** | 单 Key 限制 1MB、总缓存 10MB（纯文本待办即使记录数千条，通常仅占用几十 KB） |

---

<br/>

---

<a name="english-documentation"></a>
## 🌐 English Documentation

### 🌟 Overview

**Douya Todo** is a clean, modern, offline-first To-Do management Mini-Program built with the **native WeChat Mini-Program framework**.
Embracing a **zero-backend dependency** architecture, all user data is safely persisted within the device's local storage (`wx.setStorageSync`). It requires **no cloud base, no external database, and zero server maintenance cost**—completely private, ultra-fast, and works out-of-the-box.

---

### ✨ Key Features

1. **Zero-Jump Bottom-Sheet Modal**
   - Replaces disruptive page navigations with a sleek, bottom-up half-screen drawer for both creating and editing tasks.
   - Designed with a strict **Zero-Scrolling** principle to ensure instant form entry and optimal tactile ergonomics.
2. **Due Date Proximity Visual Grading**
   - Replaces generic warning labels with an intuitive, multi-level color hierarchy based on days remaining ($\Delta \text{Days}$):
     - **Overdue**: High-visibility deep red (`#e5484d`), displaying exact days overdue.
     - **Due Today**: Urgent orange-red (`#e03e1a`), prioritizing immediate attention.
     - **Due Tomorrow**: Warm amber (`#d97706`), encouraging proactive planning.
     - **Within 2~3 Days**: Dynamic vibrant blue (`#2563eb`), clear and reassuring.
     - **Later / Future**: Calm neutral gray (`#6b7280`), minimizing visual noise.
     - **Completed**: Low-contrast muted gray (`#9ca3af`), clean and archived.
3. **GTD Smart Hybrid Sorting Algorithm**
   - Overdue tasks are automatically placed at the very top for urgent resolution.
   - Tasks due today and upcoming deadlines are sequentially prioritized based on urgency and priority tiers (`high` > `normal` > `low`).
   - Completed tasks smoothly sink to the bottom, sorted by completion timestamp.
4. **High-Affordance Semantic Checkbox**
   - Upgraded to a $48\text{rpx}$ rounded rectangle with a subtle outline checkmark (✓) in unchecked state, providing unambiguous click affordance.
   - Expanded with an invisible $84\text{rpx} \times 84\text{rpx}$ touch target area to prevent accidental clicks on card titles.
   - Enriched with haptic feedback (`wx.vibrateShort`) and an elastic bounce animation upon completion.
5. **Swipe-Action Cell (Left-Swipe Drawer)**
   - Smooth left-swipe gesture reveals a $280\text{rpx}$ utility drawer.
   - Contains an emerald green **Complete / Revert** button and an alert red **Delete** button.
   - Features directional axis-locking to eliminate vertical scrolling interference, along with single-item exclusive expansion.
6. **Phone System Calendar Strong Reminder (100% Offline · Zero-Backend · Lock-screen Alarm)**
   - Deeply integrates the native `wx.addPhoneCalendar` API, creating real system calendar events with alarms across iOS and Android devices.
   - Fires a **lock-screen alert and ringtone at 09:00 AM** on the task due date—far more prominent than folded service notifications.
   - **100% Free & Zero Server Maintenance**: Completely eliminates recurring monthly cloud service fees, functioning reliably offline with complete data privacy.
   - Backward-compatible with optional WeChat subscription message cloud dispatching.
7. **Per-Commit 6-Stage Quality Gate**
   - Automated via `scripts/quality-gate.js` and `.githooks/pre-commit`:
     - `[1/6]` JS Syntax Static Verification (`node --check`)
     - `[2/6]` Comprehensive JSON Configuration Validation
     - `[3/6]` **WXML Tag Pairing & Closure Verification** (prevents missing `</view>` compile breaks)
     - `[4/6]` Mini-Program App Configuration Sanity Check
     - `[5/6]` Full Data-Layer, GTD Sorting & Subscription Unit Test Suites
     - `[6/6]` Bundle Single-File Size Ceiling ($\le 200\text{KB}$)

---

### 📂 Directory Structure

```
.
├── app.js                     # Global application lifecycle
├── app.json                   # Mini-program pages & window configuration
├── app.wxss                   # Global stylesheet & design tokens
├── project.config.json        # WeChat DevTools project configuration
├── project.miniapp.json       # Multi-platform framework configuration
├── sitemap.json               # Search indexing rules
├── config/                    # Configuration modules
│   ├── subscribe.js
│   └── subscribe.example.js
├── cloudfunctions/           # Lightweight cloud functions
│   └── todoReminder/          # Scheduled notification cloud function
├── pages/
│   ├── index/                 # Main page: task list, swipe cells, bottom-sheet modal
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   └── edit/                  # Dedicated edit page (legacy fallback)
├── utils/
│   ├── todo.js                # TodoManager data access layer (CRUD & local cache)
│   └── date-helper.js         # Functional date difference, urgency grading & GTD sorter
├── scripts/
│   └── quality-gate.js        # 6-Stage Pre-commit Code Quality Gate
├── tests/
│   ├── datastore.test.js      # Storage layer contract tests (42 assertions)
│   └── smart-sort.test.js     # GTD sorting & urgency grading unit tests
├── .githooks/
│   └── pre-commit             # Git pre-commit hook
├── LICENSE                    # MIT License
└── README.md                  # Bilingual documentation
```

---

### 🚀 Getting Started

1. **Download WeChat DevTools**: Get the official IDE from the [WeChat Developer Portal](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html).
2. **Import Project**:
   - Launch WeChat DevTools and select **Import**.
   - Point the directory to this project root.
   - Enter your own AppID, or choose **Test Account (测试号)** if you do not have one yet.
3. **Compile & Preview**:
   - Click **Compile (编译)**. The simulator will instantly launch with full offline functionality.

---

### 🧪 Running Tests & Quality Gate

Run the zero-dependency test suites directly using Node.js built-in test runner:

```bash
# Run all unit tests
node --test tests/datastore.test.js tests/smart-sort.test.js

# Execute all 6 stages of the quality gate
node scripts/quality-gate.js
```

---

### 📄 License

This project is licensed under the [MIT License](LICENSE).
Feel free to use, modify, and distribute it for personal or commercial projects.
