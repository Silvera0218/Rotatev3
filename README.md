# ROTATION V3

[开始游戏](https://silvera0218.github.io/Rotatev3/) · [UI 与交互图集](https://silvera0218.github.io/Rotatev3-UI-Gallery/)

旋转消除网页游戏。当前版本包含五种道具、六种特殊方块、三选一补给站、商店、暂存背包与广告复活流程。

## 本地运行

```sh
python -m http.server 5191 --bind 127.0.0.1
```

打开 `http://127.0.0.1:5191/`。

## 重新构建

```sh
python build.py
```

`source/base.html` 保存基础引擎，`lite-*.js` 与 `lite-*.css` 保存 V3 规则和界面。构建脚本生成根目录 `index.html`，并按依赖文件内容更新资源版本号。修改 V3 源码后重新构建，将源文件和生成的页面一并提交。

## 规则验证

```sh
node --test tests/rules.test.mjs
```

GitHub Pages 从 `main` 分支根目录发布。游戏进度保存在当前浏览器中。
