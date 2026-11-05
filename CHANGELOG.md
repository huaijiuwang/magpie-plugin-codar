# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-11-05

### Fixed

- **密码登录必然失败：`登录返回了另一个账号`。** 登录成功的校验把"用户输入的
  登录名"和"令牌里的厂商账号名"当成同一个字符串比较——手机号
  `13800000000` 与令牌声称的 `user_13800000000_0001` 本就不同形态，于是每一次
  真实的账号密码登录都被拒。登录回答按定义就是"刚刚登录进去的那个账号"，不该
  做等值比较；改为只要求令牌带账号名，并把用户输入的登录名存进记录
  （`loginName`），因为续期被吊销后用密码重登时，`/v1/login` 认的是手机号/
  邮箱，不是 `user_…` 这个厂商内部名。
- 串号校验保留在真正需要它的两处：续期返回的令牌指向别的账号（`renewToken`
  的 gone 分支），以及密码重登返回的账号与槽位不符（拒绝覆盖）。
- 测试 198 → 200，新增"手机号登录对应 user_… 令牌是同一账号"与"重登返回别的
  账号不覆盖槽位"两条具名用例。

## [0.2.0] - 2026-11-05

### Added

- 多账号与自动续期。登录记录从 `{type:"api", key}` 升级为带 `accountId` 的 oauth
  会话（access/refresh/expires/username/loginAt/tokenExpiresAt），于是：
  - magpie 按厂商账号名去重（`settle()`），重新登录覆盖同槽，不再每次令牌轮换
    新开一个 `codar#xxxxxx` 残留槽；
  - 记录进了宿主的续期通道（`renewAt` 只认 oauth+expires），`auth.refresh` 调
    `POST /v1/token/refresh`（桌面端自己的续期路，无验证码），`refreshLead`
    30 分钟，`keepAlive` 默认开——空闲账号也会被后台按时续住，7 天滑动窗口
    不再需要每周人工重登；`expires` 用"真实 exp 与 24 小时取小"的合成节拍，
    和桌面端一天一续对齐，每次续期后留 6 天余量；
  - 续期被厂商明确吊销（401/403 或业务码 expired）时抛 `signIn:"expired"`，
    只标记该账号、保留槽位；网络错误/超时/5xx 抛普通错误，宿主退避重试、
    不标记——一次断网不会判死整批账号。
- 第三种登录：科搭账号密码（`POST /v1/login`，与桌面端和 speedai.com 网页端
  同一接口，body `{username, password}`，读 `data.token`）。密码随记录托管，
  续期被吊销时 refresh 自动用它重登兜底；新 IP 首登被要求短信验证
  （code 201 / ip_verify_required）时如实提示，不尝试绕过。粘贴法同改为驱动
  prompts 并产出会话（不再存裸 key），校验不过就报原因拒存。
- `tokenOf`/`unusableKey` 兼容 oauth 记录（读 `access`），`loader`、`checkin`、
  `usage`、`models` 四条读凭证的路径对两种记录形状同构；续期成功的会话携带
  托管密码继续可自动重登。

### Notes

- 密码只写进 `plugin-auth.json`（宿主 0600），不进错误信息、不随卡片外泄；
  `magpie backup` 带该文件时请加口令或 `--no-sign-ins`。
- 记录形状是行为变更：旧的 api 记录在下次登录时自然被 oauth 会话替换，无迁移
  脚本；未重新登录的旧账号仍按原样工作（api 记录不进续期，过期后提示重登）。
- 测试 188 → 197：新增续期节拍、两条续期腿、吊销/网络错/短信墙/密码重登/串号
  各分支的具名用例；对应变异（去掉 accountId、网络错判成吊销、删密码分支、
  解构取错值）各红其一。

## [0.1.2] - 2026-11-04

### Fixed

- The suite now passes from the npm tarball: the style test pinned
  `CONTRIBUTING.md`, which is not shipped with the package, so running
  `node --test` inside a fresh tarball failed 1 of 188 tests. The required
  documentation files are now the ones the package actually carries
  (`README.md` and `CHANGELOG.md`), verified by unpacking a tarball and
  running the full suite inside it (188/188).

## [0.1.1] - 2026-11-04

### Changed

- The test hooks moved out of the entry module: `index.mjs` now exports only
  the plugin function, and every reader plus the `testables` object lives in
  `internal.mjs`. OpenCode 1.x takes every export of `main` for a plugin and
  refused the package over `testables`.
- The auth hook gained a `loader`, as the provider contract expects for a
  provider served through config: a request for the account carries the
  stored key, and an account with no usable key answers `{}`.

### Added

- `CHANGELOG.md`, shipped with the package.

### Removed

- The Chinese README. Project documentation — the README, CONTRIBUTING,
  this changelog and the GitHub release notes — is English-only.

## [0.1.0] - 2026-11-04

Initial release.

### Added

- A `codar` provider for magpie: 17 models (the `auto` router plus the
  DeepSeek, GLM, GPT and Claude families), OpenAI Chat Completions for most
  and Anthropic Messages for the Claude ones.
- The model list refreshed live from `GET /v1/codar/models`, with an embedded
  fallback catalog (`catalog.mjs`) and `scripts/catalog.mjs` to check and
  regenerate it.
- Two sign-in methods: reading the Codar desktop app's own token file
  (read-only) and pasting an access token.
- Daily check-in through `POST /v1/daily-sign`, once per rolling 24 hours,
  reporting the claim (with the points it added) or that the day was already
  claimed, and carrying `until` so magpie re-asks exactly when the next claim
  opens.
- Usage card: general and agent points, today's check-in state, running
  free-model activities, and the general points also reported as a wallet
  reading for routing.
- Per-model concurrency of 3 (measured), adopted from the catalog's
  `max_concurrency` when the vendor states one.
- Requests shaped like the desktop client's per endpoint: matching
  `User-Agent`, header construction, BOM-tolerant reading, an answer-size cap,
  and credential scrubbing in every message.
- A test suite (187 tests) on Node 18–24 and Bun across Linux, macOS and
  Windows, including a formatting test that pins `.editorconfig`.

[Unreleased]: https://github.com/MisonL/magpie-plugin-codar/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/MisonL/magpie-plugin-codar/releases/tag/v0.1.2
[0.1.1]: https://github.com/MisonL/magpie-plugin-codar/releases/tag/v0.1.1
[0.1.0]: https://github.com/MisonL/magpie-plugin-codar/releases/tag/v0.1.0
