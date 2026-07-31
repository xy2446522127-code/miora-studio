# 花海画布

> 面向图片、视频与工作流创作的本地优先无限画布。

**花海画布 · Developed by [xy2446522127-code](https://github.com/xy2446522127-code)**

本项目基于 [hero8152/Infinite-Canvas](https://github.com/hero8152/Infinite-Canvas)
进行开源二次开发，保留原项目作者 hero8152 / wuli大雄的署名与许可证要求。

## 主要功能

- 智能画布：节点创建、连接、批量框选、批量连接、拖动、缩放和工作流运行；产品导航只保留这一套画布入口。
- 图片与视频生成：面板只提供完整的“API 生成”和动态“插件生成”，支持提示词、拖入或上传参考素材、模型、尺寸、质量、数量和视频参数。
- 成果轨：在画布右侧分类查看图片和视频，可复制、拖回画布、打开文件或所在目录。
- 项目管理：画布按更新时间从左到右、从上到下固定排列；项目页保留克制的水面倒影。
- 素材库、AI 对话、工作流设置、API 设置和插件中心。
- 潮汐玻璃视觉、鼠标跟随光、短波纹反馈、深浅主题、中英文和界面缩放。

画布创作区不使用倒影。空白画布点击、节点拖动、连线、框选、平移、缩放与调整大小
不会产生波纹；系统启用“减少动态效果”时，跟随光与波纹自动关闭。

## Windows 快速启动

项目要求 Python 3.12。首次使用：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt "uvicorn[standard]"
.\Start-Huahai.ps1
```

以后可以直接双击：

- `启动花海画布.lnk`
- `run.bat`
- `Start-Huahai.ps1`

所有启动入口都优先使用 `.venv\Scripts\python.exe`。默认地址为
`http://127.0.0.1:3000/`。

如需重新创建带花海图标的快捷方式：

```powershell
.\Create-Huahai-Shortcut.ps1
```

## 插件

插件中心扫描：

```text
plugins/<插件 ID>/plugin.json
```

插件中心提供“打开插件文件夹”和“一键下载 AI 插件制作说明书”入口。画布会按当前图片或
视频任务动态列出所有兼容的已安装插件，不把插件固定写死在界面中。内置 Gemini 创作助手与
GPT 图像助手属于浏览器辅助插件：登录和验证码由用户在官方网页完成，下载成果可自动接回画布。
本地运行插件可以实现账号校验、任务提交、轮询和成果获取。凭据只从本机 API 设置读取，不应
写入插件清单或提交到 Git。

## 更新

应用内“项目主页”和“一键更新”只指向：

```text
https://github.com/xy2446522127-code/miora-studio
```

上游仓库仅用于署名展示和人工同步，不会自动覆盖花海画布的二次开发内容。

## 测试与截图

测试使用虚拟环境：

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

本版实机截图、四档视口核对和对照图位于
[`docs/screenshots/2026.08.01.1`](docs/screenshots/2026.08.01.1)。
概念图与实际截图分开保存，避免把设计效果图误认为已实现页面。

## 隐私

`.venv`、API Key、Cookie、浏览器资料、日志、运行时数据库、下载文件、生成媒体和
插件本地账号数据均不得提交。仓库已通过 `.gitignore` 排除这些内容。

## 许可证

原始 [`LICENSE`](LICENSE) 保留不变。非商业、持续开源和原作者署名要求继续适用于
本二次开发项目。详情见 [`NOTICE.md`](NOTICE.md)。
