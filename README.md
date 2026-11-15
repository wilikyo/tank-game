# tank-game

[打开坦克迷阵](https://wilikyo.github.io/tank-game/)

电脑支持同屏双人和人机，手机支持触屏人机。游戏在浏览器本地计算。

## 更新发布

此仓库位于主游戏源码目录下的 tank-game 文件夹。

1. 主游戏完成修改与验证后，在主游戏目录运行 `node tools/bundle.cjs`。
2. 编辑本仓库的 `release.json`，递增版本号并填写日期和更新公告。
3. 在本仓库运行 `node tools/build-release.cjs`。它读取上一级的单文件游戏，并生成带更新提示的 `index.html` 和 `version.json`。
4. 将生成文件、公告及相关改动一起提交到 main 并推送。GitHub Pages 部署完成后，原网址提供新版。

运行中的页面每分钟检查一次新版，恢复网络或切回页面时也会检查。检测会核对公告与网页的构建标识。当前局正常结算后，玩家可以刷新更新或继续旧版，刷新前保存本地比分。首次从尚无更新检测的旧网页升级，需要手动刷新一次。

发布功能的浏览器回归脚本为 `tests/update.cjs`，运行环境需能加载 playwright-core 和本机 Chrome。
