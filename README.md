# X浏览器插件集（xb-plugins）

给安卓 X浏览器（油猴兼容环境）写的三个用户脚本：单文件、零依赖、`@grant none`，全部从本仓库 GitHub Pages 分发。

**统一安装页：https://orange123eee.github.io/xb-plugins/**

## 插件

| 插件 | 版本 | 功能 | 安装 |
|---|---|---|---|
| 视频提取器 · 万能播放/下载 | v3.1.1 | 自动嗅探网页视频（直链 / m3u8 / MSE 流）；内置播放器（手势拖动、倍速、清晰度切换、续播、B站式点按交互）；**站内下载管理**（下载不跳出浏览器，OPFS 持久存储，支持断点续传、直接播放、txt/图片预览、系统分享导出） | [安装 / 更新](https://orange123eee.github.io/xb-plugins/video-extractor.user.js) |
| 广告拦截 · AdBlock Lite | v2.2.2 | 广告/追踪域名 + 第三方路径 + 第一方广告脚本三层拦截；popunder 弹窗拦截；广告库假加载骗过「关拦截器才给看」的反拦截检测；通用播放器「跳过广告」自动点；YouTube 接口级去广；徽标面板（统计 / 复制诊断 / 本站关闭） | [安装 / 更新](https://orange123eee.github.io/xb-plugins/adblock.user.js) |
| 链接净化 · 直达 | v1.1.1 | 去掉搜索结果 / 分享链接的中转跳转，点击直达；百度 / 搜狗 / 360 中转页自动秒跳，不等倒计时 | [安装 / 更新](https://orange123eee.github.io/xb-plugins/link-cleaner.user.js) |

## 更新机制

每个脚本头部 `@updateURL` 指向本仓库 Pages 地址，X浏览器 会定期自动检查并提示更新；也可以随时打开安装页覆盖安装（设置和数据不受影响，存在浏览器本地）。

广告拦截建议同时**关闭 X浏览器 自带的广告拦截**，避免两套规则互相误杀。

## 仓库说明（给协作者 / AI）

- 本仓库由 `E:\projects\x_browser` 工作区的 `publish.js` 自动推送（发布流程、网络策略、坑见该工作区 `AGENTS.md`）
- 各插件为自包含单文件；版本号在 `@version` 与代码内 `var VERSION` 两处，需同步修改
- 已知限制：用户脚本无 webRequest 权限，拦不住 HTML 解析期写死的请求（只能拦动态 + 隐藏元素）；`@grant none` 下存储按站点隔离
