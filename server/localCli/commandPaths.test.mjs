import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveCodexCommand, resolveNpmCli, resolveXhsCommand } from "./commandPaths.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "mint-cli-paths-"));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    file(relative, content = "") {
      const filePath = path.join(root, relative);
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
      return filePath;
    },
  };
}

test("explicit CLI paths take precedence over automatic resolution", () => {
  const env = Object.freeze({ CODEX_CLI_PATH: "chosen-codex", XHS_CLI_COMMAND: "chosen-xhs", PATH: "" });
  assert.equal(resolveCodexCommand({ env, platform: "win32" }), "chosen-codex");
  assert.equal(resolveXhsCommand({ env, platform: "win32" }), "chosen-xhs");
});

test("Windows npm Codex shims resolve to the native executable in the platform package", (t) => {
  const files = fixture(t);
  files.file("npm 目录/codex.cmd", "@exit /b 99");
  files.file("npm 目录/node_modules/@openai/codex/package.json", '{"name":"@openai/codex"}');
  files.file("npm 目录/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/package.json", '{"name":"@openai/codex-win32-x64"}');
  const executable = files.file("npm 目录/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe");
  const env = Object.freeze({ Path: path.join(files.root, "npm 目录") });
  assert.equal(resolveCodexCommand({ env, platform: "win32", arch: "x64" }), executable);
});

test("Windows Codex can be located in the user npm prefix without a PATH entry", (t) => {
  const files = fixture(t);
  const executable = files.file("Roaming/npm/node_modules/@openai/codex/vendor/x86_64-pc-windows-msvc/codex/codex.exe");
  const env = { APPDATA: path.join(files.root, "Roaming"), PATH: "" };
  assert.equal(resolveCodexCommand({ env, platform: "win32", arch: "x64" }), executable);
});

test("native Windows executables respect PATH order", (t) => {
  const files = fixture(t);
  const first = files.file("first/codex.exe");
  files.file("second/codex.exe");
  const env = { PATH: [path.join(files.root, "first"), path.join(files.root, "second")].join(path.delimiter) };
  assert.equal(resolveCodexCommand({ env, platform: "win32" }), first);
});

test("ARM64 Codex packages use the correct native target", (t) => {
  const files = fixture(t);
  const executable = files.file("npm/node_modules/@openai/codex/vendor/aarch64-pc-windows-msvc/bin/codex.exe");
  assert.equal(resolveCodexCommand({ env: { PATH: path.join(files.root, "npm") }, platform: "win32", arch: "arm64" }), executable);
});

test("Windows xhs falls back to the uv user executable directory", (t) => {
  const files = fixture(t);
  const executable = files.file("user/.local/bin/xhs.exe");
  assert.equal(resolveXhsCommand({ env: { USERPROFILE: path.join(files.root, "user"), PATH: "" }, platform: "win32" }), executable);
});

test("npm resolves to its JavaScript entry point beside Node rather than npm.cmd", (t) => {
  const files = fixture(t);
  const executable = files.file("Node 目录/node.exe");
  files.file("Node 目录/npm.cmd", "@exit /b 99");
  const npmCli = files.file("Node 目录/node_modules/npm/bin/npm-cli.js");
  assert.equal(resolveNpmCli({ env: {}, execPath: executable }), npmCli);
});

test("missing installations keep command lookup and do not change other platforms", () => {
  const env = Object.freeze({ PATH: "" });
  assert.equal(resolveCodexCommand({ env, platform: "win32" }), "codex");
  assert.equal(resolveXhsCommand({ env, platform: "win32" }), "xhs");
  assert.equal(resolveCodexCommand({ env, platform: "darwin" }), "codex");
  assert.equal(resolveXhsCommand({ env, platform: "linux" }), "xhs");
});
