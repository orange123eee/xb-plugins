# X浏览器插件集（xb-plugins）

给安卓 X浏览器（油猴兼容环境）写的三个用户脚本：单文件、零依赖、`@grant none`，全部从本仓库 GitHub Pages 分发。

**统一安装页（实时显示版本）：https://orange123eee.github.io/xb-plugins/**

## 插件

| 插件 | 功能 | 安装 |
|---|---|---|
| 视频提取器 · 万能播放/下载 | 自动嗅探网页视频（直链 / m3u8 / MSE 流）；内置播放器（手势拖动、倍速、清晰度切换、续播、B站式点按交互）；**站内下载管理**（下载不跳出浏览器，OPFS 持久存储，断点续传，完成后一键「保存到相册」，可直接播放、txt/图片预览） | [安装 / 更新](https://orange123eee.github.io/xb-plugins/video-extractor.user.js) |
| 广告拦截 · AdBlock Lite | 广告/追踪域名 + 第三方路径 + 第一方广告脚本三层拦截；popunder 弹窗拦截；广告库假加载骗过「关拦截器才给看」的反拦截检测；通用播放器「跳过广告」自动点；YouTube 接口级去广；**远程规则订阅**（改规则不用发版）；徽标面板（统计 / 复制诊断 / 更新规则 / 本站关闭） | [安装 / 更新](https://orange123eee.github.io/xb-plugins/adblock.user.js) |
| 阅读增强 · 畅读 | 小说/长文自动下一章无缝合并（免翻页）、正文净化、字号行距主题调节、进度记忆；检测到长文时右侧出现「畅读」页签 | [安装 / 更新](https://orange123eee.github.io/xb-plugins/reader.user.js) |
| 链接净化 · 直达 | 去掉搜索结果 / 分享链接的中转跳转，点击直达；百度 / 搜狗 / 360 中转页自动秒跳；**清洗 utm/spm/fbclid 等追踪参数**（含地址栏，分享出去的链接干净） | [安装 / 更新](https://orange123eee.github.io/xb-plugins/link-cleaner.user.js) |

（版本号以安装页实时显示为准，此处不硬编码）

## 更新机制

每个脚本头部 `@updateURL` 指向本仓库 Pages 地址，X浏览器 会定期自动检查并提示更新；也可以随时打开安装页覆盖安装（设置和数据不受影响，存在浏览器本地）。

- 广告拦截建议同时**关闭 X浏览器 自带的广告拦截**，避免两套规则互相误杀
- 广告拦截的远程规则表 [`rules.json`](https://orange123eee.github.io/xb-plugins/rules.json) 独立于脚本版本：改规则推上来后，用户端 6 小时内自动生效（面板「更新规则」可立即拉取）

## 仓库说明（给协作者 / AI）

- 本仓库由 `E:\projects\x_browser` 工作区的 `publish.js` 自动推送（发布流程、质量门禁、网络策略、坑见该工作区 `AGENTS.md`）
- 各插件为自包含单文件；版本号在 `@version` 与代码内 `var VERSION` 两处，需同步修改
- 已知限制：用户脚本无 webRequest 权限，拦不住 HTML 解析期写死的请求（只能拦动态 + 隐藏元素）；`@grant none` 下存储按站点隔离
