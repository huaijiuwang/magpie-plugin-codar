# magpie-plugin-codar

A [magpie](https://github.com/yetone/magpie) plugin for **Codar (科搭)**, the research desktop app by SpeedAI. It adds Codar's models to magpie as a provider, handles the daily check-in, and reports the account's points on the usage card.

## Features

- **Provider** — registers a `codar` provider with Codar's model list (17 models: the `auto` router plus the DeepSeek, GLM, GPT and Claude families). The list is embedded in `catalog.mjs` and refreshed from `GET /v1/codar/models` when signed in. Chat goes from magpie straight to Codar's gateway (`https://api.claw.speedai.com/v1`) — OpenAI-compatible for most models, Anthropic Messages for the Claude ones.
- **Sign-in** — three methods, each saving one renewable session per account: “读取本机科搭令牌” (keyless: the plugin reads the desktop app's token file itself, read-only), “科搭账号密码” (signs in over the account domain, and keeps the password so the plugin can re-login on its own when the vendor turns the session away), and pasting a Codar access token.
- **Renewal** — the token the app holds is a 7-day JWT that the app re-news once a day. This plugin takes that over: it saves each account as an oauth sign-in, so magpie re-news it through `POST /v1/token/refresh` on that same daily beat — before a request, a usage read, a check-in, or in the background while the account sits idle (magpie's keep-alive). An idle account no longer lapses after 7 days, and N accounts can stay signed in on one machine without opening the app.
- **Multi-account** — sign in more than once and each account is kept under its own magpie slot (`codar`, `codar#xxxxxx`), told apart by the vendor's account name (`accountId`, from the token's `username`). Check-in, usage, concurrency, caps and per-request account pinning (`X-Magpie-Account`) all work per account; re-signing the same account replaces its slot rather than adding a stray one.
- **Daily check-in** — `POST /v1/daily-sign`, once per rolling 24 hours. The answer reports the claim (including the points it added) or that the day was already claimed, and carries `until` (magpie ≥ 0.1.1795) so magpie re-asks exactly when the next claim opens.
- **Usage** — points (general + agent), today's check-in state, and any free-model activity still running. The general points are also reported as a wallet reading (magpie #3950) so routing has a figure for the account; if the first balance endpoint fails, the card still shows what the second one answered.

## Install

```bash
magpie plugin add magpie-plugin-codar                  # from npm
# magpie plugin add github:MisonL/magpie-plugin-codar  # or from GitHub
# magpie plugin add "$PWD"                             # or from a checkout
magpie plugin login codar      # pick "读取本机科搭令牌", or paste the token
```

Then select a `codar` model in magpie, and turn on its check-in under
Settings (设置) → 额度 (Quota) → 预热与签到 (warm-up & check-in) → 插件 (Plugins).

## Signing in

Codar keeps its JWT in its own config file:

- macOS / Linux: `~/.codar/config.json`
- Windows: `%USERPROFILE%\.codar\config.json`
- `$CODAR_HOME/config.json` when `CODAR_HOME` is set (the app honours it, and so does this plugin)

The value is `provider.speedai.token`. The “读取本机科搭令牌” method reads it for you — read-only, never written — and checks it has an account name and has not expired before saving it. To paste it manually:

```bash
python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.codar/config.json")))["provider"]["speedai"]["token"])'
```

The token carries the account name and an expiry (7 days after the app's last login).

## Renewal and multiple accounts

The three methods all hand magpie the same thing: a session with the token,
the account name and a renewal time one day out. magpie then keeps it alive
itself — it calls the plugin's `refresh` when the renewal comes due, before
anything uses the account and in the background while it sits idle, exactly
the way the desktop app re-news every 24 hours. A refresh trades the current
token at `POST /v1/token/refresh` (no captcha, no password); if the vendor
has turned the session away and the account was signed in with a password,
the plugin re-logs in with it instead. When there is no kept password and the
vendor refuses for good, the account is marked so the card says "sign in
again" — and only that account, the others keep running.

Sign in to a second account the same way and it lands in its own slot. magpie
checks in, prices, caps and routes each slot separately, and a request can be
pinned to one account with `X-Magpie-Account`. Re-signing an account you
already have replaces its slot (matched by the account name in the token)
instead of opening a second one.

Two things about the password method are worth knowing before you use it:

- The password is stored in magpie's `plugin-auth.json` (kept 0600) so the
  plugin can re-login unattended. If you use `magpie backup`, either give the
  backup a passphrase or pass `--no-sign-ins` — do not share a backup that
  carries passwords.
- A first sign-in from a new IP can be turned away with a request for SMS
  verification (`ip_verify_required`). The plugin will not try to pass that;
  sign in once from the app or the web page on that network, then sign in
  again here.

## Notes

- **Prices stay as magpie sets them.** Codar lists prices in CNY and magpie's cost column is USD, so the plugin reports no price of its own rather than inventing an exchange rate. magpie still prices models by what models.dev says their makers charge, and a per-model price you set in magpie overrides everything.
- **Reasoning levels are not mapped to variants.** The vendor's `reasoning.levels` describe request-body rewrites (`set`/`omit`) the desktop app applies itself; magpie's variants only name levels, so the models carry `reasoning: true` and no variants.
- **Free-model activities are reported, not claimed.** The one-time campaign claim is not a daily check-in; the plugin only shows the activities that are running.
- **Concurrency is 3 per model** (measured; the vendor publishes no figure). magpie queues requests past it, and the provider setting can raise it. If the catalog ever states `max_concurrency`, the plugin adopts it without a release.
- **The check-in is a text row, not a percentage** — a check-in is not an allowance that runs out. A wait it cannot use (missing, zero, past year 9999, or over a week) falls back to a 30-minute trust floor, so a rolling 24-hour window cannot lose the next claim.
- **Fallback list.** If `GET /v1/codar/models` cannot be reached, the provider keeps the embedded `catalog.mjs` and magpie marks the list as fallen back; its sizes may trail the live list, and the live list wins whenever it can be fetched. A model's reply ceiling is the vendor's own (`max_tokens.maximum` → `limit.output`), so magpie lowers over-asking requests instead of letting the vendor refuse them.
- Models you add to this provider yourself survive list refreshes; the vendor's entries follow the vendor. A provider name or `api` you set in magpie survives restarts.
- The plugin follows the vendor client's own reading rules (field spellings, body codes, the “already claimed” wording in both Chinese and English), omits times it cannot write down rather than guessing, and never prints credentials — error messages are scrubbed by the token's shape, and oversized vendor answers are refused while they are read.
- Requests match the desktop client's shape per path: Node's default `User-Agent` to the account, activity and catalog endpoints, a Go HTTP client's to chat. The `chat.headers` hook runs for every provider's requests, so it filters by provider id and touches only `codar` traffic.

## Development

```bash
node --test                       # the whole suite, no network
bun test                          # the runtime magpie actually loads plugins on
node scripts/catalog.mjs --check  # is catalog.mjs still what the vendor says?
node scripts/catalog.mjs          # regenerate it from the signed-in app
```

`catalog.mjs` is generated with the plugin's own reader (`catalogOf`), so the fallback and the live list are built by the same rules. Its exit codes keep failures apart: `0` nothing moved, `1` a record moved (`--check` only), `2` the vendor or the file could not be read — a failed run writes nothing and never empties the fallback. It needs a signed-in app, so it is a local command, not a CI step.

The suite also pins the formatting in `.editorconfig` (LF, one final newline, no trailing whitespace, two-space indent) — `test/style.test.mjs` walks the tree, so a new file is covered the moment it lands. `CONTRIBUTING.md` has the invariants the tests defend.

CI runs the suite on Node 18–24, on Bun across Linux / macOS / Windows, and on Node on Windows and macOS — the plugin reads a file under the home directory, and that is where per-platform differences show up.

Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html); [CHANGELOG.md](CHANGELOG.md) records every release, and the release process is described in `CONTRIBUTING.md`.

## Licence

MIT.
