# 题库学习中心 · 独立离线 PWA 测试站

用于 iPhone Safari 安装与离线验证。原有正式站和旧离线测试站均不修改。

## iPhone 安装

1. 在 Safari 打开本仓库的 GitHub Pages 地址，首次保持联网。
2. 等待页面显示“离线已就绪”。
3. Safari 分享菜单 → 添加到主屏幕。
4. 从主屏幕图标联网打开一次，确认这里也显示“离线已就绪”，再开启飞行模式验证。
5. 日后从主屏幕进入。只有点击“检查更新”才由应用检查并下载新版本。

日常打开、刷新、切换章节、答题和公式渲染只读完整本地快照；资源缺失也不回退联网。Safari/浏览器自身的 Service Worker 更新、安装清单检查或其他系统行为属于浏览器层，不能承诺绝对零设备网络流量。

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

## 验证范围

已使用真实 Chromium、390×844 触屏视口验证；模拟尺寸不等于 iPhone Safari 真机验证。iPhone 的 Safari/主屏幕安装、系统存储保留及操作系统后台行为仍需设备实测。
