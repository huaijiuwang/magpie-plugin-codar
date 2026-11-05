# 维护这份 fork

这份仓库是 [`MisonL/magpie-plugin-codar`](https://github.com/MisonL/magpie-plugin-codar)
的本地分支（发布在 `huaijiuwang/magpie-plugin-codar`，仓库名与包名一致），比上游多三件事（详见
[CHANGELOG.md](CHANGELOG.md) 0.2.0 / 0.2.1）：

1. 登录记录从 `{type:"api", key}` 升级为带 `accountId` 的 oauth 会话 → magpie 按
   账号去重、多账号各占一槽；
2. 实现 `auth.refresh`：按厂商"到期前 3 天"的窗口自动续期 + 密码兜底重登；
3. 新增"科搭账号密码"登录方式，并把粘贴法也改成产出会话。

**仓库名与包名都叫 `magpie-plugin-codar`**：仓库挂在个人账号下与上游同名不冲突
（`MisonL/magpie-plugin-codar` 与 `huaijiuwang/magpie-plugin-codar` 是两个仓库），
而 magpie 认插件靠的正是包名（`store.go` 的 `gitName` 读 `plugins/package.json` 里
bun 记下的依赖名），两者一致时 `plugin add github:…` 的依赖名、供应商 id、
已有登录态、`plugin update` 的匹配都不用额外照顾。

**仓库里的手机号一律打码**：本 fork 只出现在自己的仓库里，示例账号用
`13800000000` / `user_13800000000_0001`，真实号码不要写进代码、注释、测试或
CHANGELOG——一旦推上去，历史会带着它走。

改动集中在 `index.mjs`（methods / refresh）、`internal.mjs`（tokenOf / cadence /
sessionOf / renewToken / loginWithPassword）、`test/plugin.test.mjs`。
`catalog.mjs` 未改动，上游重新生成时直接取上游的。

## 一、上游发新版后，怎么合进来

本仓库的远端已经摆好：`upstream` 指上游（MisonL）。你自己的 fork 需要另加一个远端，
下面的例子叫 `mine`。

```bash
cd E:/zhip/codar-plugin
git remote -v                     # upstream -> github.com/MisonL/magpie-plugin-codar
git remote add mine https://github.com/huaijiuwang/magpie-plugin-codar.git   # 只需一次

git fetch upstream --tags
git rebase upstream/main          # 或 git merge upstream/main，看你要线性还是合并点

# 冲突多半出现在这三处，按"保留本 fork 的行为"解：
#   index.mjs   methods / refresh / refreshLead
#   internal.mjs tokenOf / renewToken / sessionOf / cadence
#   test/plugin.test.mjs  断言 {type:"success", key} 的旧用例
node --test                        # 必须全绿，当前基线 200 条
```

`catalog.mjs` 若冲突，**取上游的**（它是厂商模型的生成物，本 fork 没改）。

验证通过后发版：

```bash
node scripts/release.mjs patch --patch   # 测试→升版本→commit→tag→出 zip 与 .patch
git push mine main --tags                # 推到自己的 fork
```

## 二、本机怎么覆盖升级

三种安装源，选一种，**同名包会被原地替换**（不用先 `rm`）：

| 源 | 命令 | `magpie plugin update` 会动它吗 |
|---|---|---|
| 本地文件夹（当前用的） | `magpie plugin add E:/zhip/codar-plugin` | **不会**（path 源被跳过） |
| 自己的 GitHub tag（推荐多机） | `magpie plugin add github:huaijiuwang/magpie-plugin-codar#v0.2.2` | 会按 spec 重新拉取 |
| npm 官方版 | `magpie plugin add magpie-plugin-codar@latest` | 会，**且会覆盖掉本 fork 的行为** |

所以本机日常升级只有一条命令：

```bash
node scripts/release.mjs patch        # 改完代码、测试通过后
magpie plugin add E:/zhip/codar-plugin   # 重新指一次 → 触发宿主重启加载新代码
```

> 为什么不用 npm pack 的 `.tgz`：magpie 的源只认「npm 包名 / git 仓库 / 目录路径」，
> `.tgz` 文件会被当作目录去 stat，装不上。要打包分发，用 zip 解压成目录，或走 git。

## 三、另一台电脑怎么装

### 方案 A：走自己的 GitHub（多机首选，能一条命令升级）

```bash
# 这台机器上（只需一次）：把 fork 推上去
git remote add mine https://github.com/huaijiuwang/magpie-plugin-codar.git
git push mine main --tags

# 另一台电脑
magpie plugin add github:huaijiuwang/magpie-plugin-codar#v0.2.2
magpie plugin login codar        # 见下方"登录"一节
```

以后你发新 tag，那台机器改一次 spec 即可（pin 到 tag 的不会自动漂移）：
`magpie plugin add github:huaijiuwang/magpie-plugin-codar#v0.2.2`。

### 方案 B：拷贝目录（离线 / 不想用 git）

```bash
node scripts/release.mjs patch        # 生成 dist/magpie-plugin-codar-v0.2.2.zip
# 把 zip 拷到另一台电脑，解压到比如 D:/codar-plugin，然后：
magpie plugin add D:/codar-plugin
```

path 源的好处是**永远不会被 `magpie plugin update` 覆盖**；代价是升级要重新拷一次。

### 方案 C：只在另一台机器上打补丁（不想要整个 fork）

```bash
git clone https://github.com/MisonL/magpie-plugin-codar.git codar-plugin
cd codar-plugin
git am /path/to/0001-multi-account.patch     # 补丁由 scripts/release.mjs --patch 生成
node --test && magpie plugin add "$PWD"
```

适合"上游追得紧、只想叠一小层改动"的场景；冲突处理比方案 A 麻烦。

### 登录（每台机器各登一次，**不要拷 `plugin-auth.json`**）

```bash
magpie plugin login codar 1    # 1 = 读取本机科搭令牌（该机器桌面端已登录）
magpie plugin login codar 2    # 2 = 科搭账号密码（桌面端没登录时用）
```

两台机器各自登录 = 两条独立会话。直接拷 `plugin-auth.json` 会让两台机器拿同一把
令牌各自续期，是否互踢取决于服务端单会话与否（尚未实测），不值得赌。

## 四、回滚

```bash
magpie plugin add magpie-plugin-codar@0.1.2      # 回官方版（会丢掉本 fork 的行为）
magpie plugin add E:/zhip/codar-plugin           # 再回到本地版
```

登录态在 `~/.config/magpie/plugin-auth.json`，与插件版本无关：回滚到 0.1.2 后旧记录
是 oauth 形状，0.1.2 的 `tokenOf` 只认 `key` → 会显示未登录，重新登录一次即可。

## 五、装完怎么确认

```bash
magpie plugin list --json | grep -A2 '"codar"'
```

期望看到 `"renews": true`、`"renewLead": 1800000`、`methods` 里有三条（含"科搭账号密码"）。
再看记录形状：

```bash
python -c "import json,os;d=json.load(open(os.path.expanduser('~/.config/magpie/plugin-auth.json')));v=d['codar'];print(v['type'],v.get('accountId'),round((v['expires']-__import__('time').time()*1000)/86400e3,2),'d')"
```

期望：`oauth user_… 4.x d`（续期点在令牌寿命第 4.5 天附近，落在厂商 3 天窗口内）。

## 六、本 fork 还没做的（别当成 bug）

- 桌面端跟随 / 写回（`desktopFollow` / `writeBack`）：多个 Magpie 与桌面端同时持有
  同一账号时的让位逻辑，见设计文档 §5.4 注；
- DPAPI 独立凭据文件：密码目前随记录存在 `plugin-auth.json`（0600），别忘了
  `magpie backup` 要么加口令、要么 `--no-sign-ins`；
- 出口 IP 隔离：走宿主原生的 `accountProxies`，见设计文档 §5.10，不需要改插件。
