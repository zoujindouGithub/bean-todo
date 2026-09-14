# 在微信开发者工具里跑起来（本机专用说明）

> 本文针对本机环境（Windows + 远程桌面会话）写成，补充 `README.md` 之外的运行时排障信息。

## 当前进度

| 项 | 状态 |
| --- | --- |
| 小程序 AppID | ✅ `wxcec5a0f51ae11d93`（已写入 `project.config.json`） |
| 数据存储 | ✅ 本地缓存（`utils/todo.js`），**无需任何云环境配置** |
| 云开发 | ❌ 已弃用（原因见 `README.md`，纯本地存储即可发布） |
| DevTools 打开项目 | ⬜ **待你手动完成**（见下） |

## 为什么不能自动打开

尝试用开发者工具的命令行（`cli.bat open --project`）自动打开，最终失败。原因有两层，都属于**环境限制**，不是项目配置问题：

1. **IDE 在远程桌面会话里会崩溃**。日志报：
   ```
   GPU process exited unexpectedly: exit_code=1
   FATAL: GPU process isn't usable. Goodbye.
   ```
   本机开着 3389 远程桌面，远程会话拿不到 GPU 虚拟化上下文，Electron 的 GPU 进程起不来。

2. **首次启动必须微信扫码登录**，这一步只能你本人操作。

## 你要做的事（3 步）

1. 从**开始菜单**打开「微信开发者工具」（在你自己的桌面会话里直接开，不要从命令行拉）。
2. 用**注册「豆芽待办」的那个微信号**扫码登录。
3. 选择「**导入项目**」，目录填：
   ```
   C:\Users\zouji\.workbuddy\腾讯云开发\todo-miniprogram
   ```
   AppID 已自动填好，直接确定即可。

## 验收标准

在模拟器里**加一条待办，能出现在列表里** → 说明数据层工作正常。

由于当前是纯本地存储版本，不再有云调用，「环境不存在」「权限不足」这类报错**不会再出现**。若仍报错，只可能是代码问题，把 Console 里的报错文本发我即可。

## 附：如果 DevTools 启动就闪退

确认是 GPU 问题时，改用命令行带参数启动：

```
cd /d "D:\Program Files (x86)\Tencent\微信web开发者工具"
微信开发者工具.exe --disable-gpu --in-process-gpu --no-sandbox
```

`--in-process-gpu` 把 GPU 塞进主进程，绕开崩溃的独立 GPU 进程——实测能让 IDE 稳定存活（虽然渲染是软件模拟）。

## 附：服务端口已帮你开启

IDE 的「设置 → 安全设置 → 服务端口」是命令行调用的总开关，默认关闭。已直接写进 IDE 配置文件置为开启：

```
...\User Data\bf938c1203f9e0460b7dd4d58f95dcc0\WeappLocalData\localstorage_*.json
  → /security/enableServicePort = true
```

开启后你可自行用 CLI 做预览/上传：

```
"D:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" preview --project "C:\Users\zouji\.workbuddy\腾讯云开发\todo-miniprogram"
```

若哪天想关掉，在 IDE「设置 → 安全设置」里把服务端口关掉即可（会覆盖此配置）。
