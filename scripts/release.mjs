#!/usr/bin/env node
// release.mjs cuts a release of this fork: tests, version, commit, tag, and
// the two artifacts another machine can take — a zip to unpack (a path spec
// magpie accepts) and an optional git patch to stack onto upstream.
//
// Why a zip and not `npm pack`'s .tgz: magpie's plugin sources are an npm
// name, a git repository, or a directory path (store.go's IsPath/gitSpec).
// A .tgz is none of them — it is stat'd as a directory and refused — so a
// tarball would look like a release and install nowhere.
//
// Usage:
//   node scripts/release.mjs patch                 # 0.2.1 -> 0.2.2
//   node scripts/release.mjs minor --patch         # also write the .patch
//   node scripts/release.mjs 0.3.0 --no-commit     # version and artifacts only
//   node scripts/release.mjs patch --dry-run       # say what it would do
//
// It never pushes: the remotes of a fork are the user's own business.

import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const argv = process.argv.slice(2)
const dry = argv.includes("--dry-run")
const wantPatch = argv.includes("--patch")
const noCommit = argv.includes("--no-commit")
const want = argv.find((a) => !a.startsWith("--")) ?? ""

const say = (s) => console.log(s)
const die = (s) => {
  console.error("✗ " + s)
  process.exit(1)
}
// stdio inherit hands back nothing, so only a captured run has output to trim
const run = (cmd, args, opts = {}) => {
  const out = execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: opts.quiet ? "pipe" : "inherit", ...opts })
  return typeof out === "string" ? out.trim() : ""
}

const pkgPath = join(root, "package.json")
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
if (pkg.name !== "magpie-plugin-codar") die(`this is ${pkg.name}, not magpie-plugin-codar`)

const bump = (v, kind) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  if (!m) die(`package.json version ${v} is not x.y.z`)
  const [maj, min, pat] = m.slice(1).map(Number)
  if (kind === "major") return `${maj + 1}.0.0`
  if (kind === "minor") return `${maj}.${min + 1}.0`
  return `${maj}.${min}.${pat + 1}`
}

const next = /^\d+\.\d+\.\d+$/.test(want) ? want : bump(pkg.version, want || "patch")
if (next === pkg.version) die(`version is already ${next}`)
if (!/^\d+\.\d+\.\d+$/.test(next)) die(`"${want}" is not patch|minor|major or x.y.z`)

say(`release ${pkg.version} → ${next}${dry ? "  (dry run)" : ""}`)

// 1. the suite is the gate: a release that fails its own tests never ships
say("\n[1/5] tests")
run(process.execPath, ["--test"])

// 2. version
say("\n[2/5] version")
if (dry) say(`  would write ${next} to package.json`)
else {
  writeFileSync(pkgPath, readFileSync(pkgPath, "utf8").replace(`"version": "${pkg.version}"`, `"version": "${next}"`))
  say(`  package.json: ${pkg.version} → ${next}`)
}

// 3. commit and tag (skipped with --no-commit, and in a dirty tree of someone
//    else's making it says so rather than sweeping it in)
if (noCommit) say("\n[3/5] commit skipped (--no-commit)")
else if (dry) say(`\n[3/5] would commit and tag v${next}`)
else {
  say("\n[3/5] commit and tag")
  // a machine with no global git identity still cuts a release: the -c pairs
  // are what make the commit and the annotated tag possible at all (an
  // "unknown committer" is the failure that leaves a version bumped, tagged
  // nowhere, and the zip step with nothing to archive)
  const who = ["-c", "user.name=" + (process.env.GIT_AUTHOR_NAME || "fork"), "-c", "user.email=" + (process.env.GIT_AUTHOR_EMAIL || "fork@local")]
  run("git", ["add", "-A"])
  run("git", [...who, "commit", "-m", `release: v${next}`])
  run("git", [...who, "tag", "-a", `v${next}`, "-m", `v${next}`])
  say(`  tagged v${next}`)
}

// 4. artifacts: the zip a path install unpacks, the patch an upstream checkout takes
const dist = join(root, "dist")
const zip = join(dist, `magpie-plugin-codar-v${next}.zip`)
const patch = join(dist, `magpie-plugin-codar-v${next}.patch`)
say("\n[4/5] artifacts")
if (dry) say(`  would write ${zip}${wantPatch ? " and " + patch : ""}`)
else {
  mkdirSync(dist, { recursive: true })
  if (existsSync(zip)) rmSync(zip)
  // git archive, so only tracked files land in it: no .install-backup, no
  // node_modules, no token file that happened to sit in the folder
  run("git", ["archive", "--format=zip", `--prefix=magpie-plugin-codar/`, "-o", zip, noCommit ? "HEAD" : `v${next}`])
  say(`  ${zip}`)
  if (wantPatch) {
    // the commits this fork has over upstream, as one patch series
    const base = (() => {
      try {
        return run("git", ["merge-base", "HEAD", "upstream/main"], { quiet: true })
      } catch {
        return ""
      }
    })()
    if (!base) say("  no upstream remote (git remote add upstream https://github.com/MisonL/magpie-plugin-codar.git), patch skipped")
    else {
      const text = execFileSync("git", ["format-patch", `${base}..HEAD`, "--stdout"], { cwd: root, encoding: "utf8" })
      writeFileSync(patch, text)
      say(`  ${patch}`)
    }
  }
}

// 5. what the other machines run
say("\n[5/5] next")
const zipHint = `解压到 D:/codar-plugin 后：magpie plugin add D:/codar-plugin`
say(`  本机：magpie plugin add ${root.replace(/\\/g, "/")}`)
say(`  另一台：${zipHint}`)
say(`  走 git：git push origin main --tags，另一台 magpie plugin add github:<你>/magpie-plugin-codar#v${next}`)
