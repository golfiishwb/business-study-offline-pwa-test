# 题库学习中心 · 独立离线 PWA 测试站

用于 iPhone Safari 安装与离线验证。原有正式站和旧离线测试站均不修改。

## iPhone 安装

1. 在 Safari 打开本仓库的 GitHub Pages 地址，首次保持联网。
2. 等待页面显示“离线已就绪”。
3. Safari 分享菜单 → 添加到主屏幕。
4. 从主屏幕图标联网打开一次，确认这里也显示“离线已就绪”，再开启飞行模式验证。
5. 日后从主屏幕进入。只有点击“检查更新”才由应用检查并下载新版本。

日常打开、刷新、切换章节、答题和公式渲染只读完整本地快照；资源缺失也不回退联网。Safari/浏览器自身的 Service Worker 更新、安装清单检查或其他系统行为属于浏览器层，不能承诺绝对零设备网络流量。

## AI 助教解析编辑

答题后可以查看已有解析并点击“编辑解析”，修改后选择“保存 AI 助教解析”或“取消”。空内容不会覆盖已有解析。
本地修改优先于导入题库中的旧解析；刷新、离线重开、应用更新后保留，并随完整备份和题库导出一起保存。
编辑、保存、查看和数学公式渲染均在本机进行，不产生应用网络请求。首次获取新解析仍可复制题目提示到外部 AI，再粘贴回题库保存。

## 学习记录与迁移

学习记录保存在此站点的 localStorage 和 IndexedDB。更新只切换应用缓存，不清空学习存储。
“说明与备份”可导出和恢复包含学习记录的完整备份。系统清理网站存储、清除浏览器数据或更换浏览器，均可能需要从备份恢复。

GitHub Pages 是新的站点来源，不能自动读取旧网站的学习记录。旧站记录仍保留在旧站；完整迁移需要先从旧站导出兼容的完整备份，再在新站恢复，不能把普通题库导出当作学习记录备份。

## 更新实现

- Service Worker 的 install/activate 不下载题库快照。首次页面安装会显式启动完整安装，后续应用更新仅由按钮触发。
- `release.json` 列出完整离线文件、字节长度及 SHA-256。
- 所有文件下载并验证成功后，才切换一个缓存指针；失败删除暂存并保留完整旧版。
- 不注册同步、推送、后台版本轮询或导航预加载；不调用日常 registration.update()。
- Tailwind 样式、MathJax SVG 与题库都内嵌在应用页面中，无 CDN、远程字体或图片依赖。
- 完整缓存被系统清理时显示修复页面；只有用户按修复按钮才尝试联网重新安装。
- 所有路径相对于仓库子路径，Service Worker 作用域仅限本测试仓库。

## 开发与发布

网站静态文件在 `site/`。稳定的离线路由源文件在 `src/service-worker.js`，需同步到 `site/service-worker.js`。

更新题目或页面后，生成新版本并验证：

```sh
python3 scripts/update-release.py 20261024-pwa2
python3 scripts/update-release.py --verify
```

提交至 `main` 后由 GitHub Actions 发布 `site/`。禁止只修改页面而复用旧的版本号。

测试需 Node.js、Playwright 和 Chromium，运行 `npm install`、`npx playwright install chromium`、`npm test`。
测试输出在 `test-evidence/`，本机服务器日志区分实际到达的应用请求和浏览器的 SW 脚本检查。测试包含模拟故障版本，不会向 GitHub Pages 发布故障内容。

## 入口文件与离线快照

`site/index.html` 是唯一应用页面编辑源；`install.html`、`learning.html` 是兼容入口，由 `scripts/update-release.py VERSION` 自动生成同内容副本。它们用于旧书签或首次在线直接访问，不应单独编辑。

安装完成后，Service Worker 将首页、安装入口和学习入口的导航统一映射到缓存的 `index.html`；离线快照只保存一份约 3.2 MB 的应用页面。`release.json` 因此只列出 `index.html`、manifest 和两个图标；Service Worker 脚本由浏览器自身的注册生命周期管理，不放进应用快照。

`--verify` 在发布前校验三个 HTML 的字节一致性，以及 `src/service-worker.js` 与发布副本的一致性；任何漂移都会阻止发布。仓库和托管仍保留三个入口文件，不把它们描述为已物理合并。

## AI 回归测试基线

`npm run test:ai` 使用历史版本 `088126fe396dde1d355d7d0ee5f118ba585a6af0` 验证“旧版已有解析 → 新版升级 → 离线编辑”的兼容性。请使用包含这段历史的完整 Git checkout；历史 HTML 通过文件描述符写入临时文件，避免 `execFileSync` 默认 stdout 缓冲区对大页面产生 `ENOBUFS`。临时文件在读取成功或失败后都会清理。

`PWA_BASELINE_HTML` 和 `PWA_BASELINE_RELEASE` 仍支持指定外部基线文件，但正常完整 checkout 不需要设置它们。测试不依赖系统剪贴板复制成功，保留真实浏览器的剪贴板失败降级路径。

真实 iPhone Safari 的验收步骤及待测项目见 [iOS 验收清单](docs/ios-acceptance.md)。Cursor 审计中的 `scripts/full-checklist.cjs` 未随摘要提供，当前仓库没有收录或声称运行过该脚本。

## 验证范围

已使用真实 Chromium、390×844 触屏视口验证；模拟尺寸不等于 iPhone Safari 真机验证。iPhone 的 Safari/主屏幕安装、系统存储保留及操作系统后台行为仍需设备实测。
