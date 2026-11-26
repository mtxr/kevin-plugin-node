"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { convert, taskName } = require("../src/plugin.js");

test("one task per script, running it through npm", () => {
  const r = convert(JSON.stringify({ scripts: { build: "tsc -p .", test: "node --test" } }));
  assert.equal(
    r.markdown,
    [
      "# Tasks",
      "",
      "## > build",
      "",
      "> tsc -p .",
      "",
      "```sh",
      "npm run build",
      "```",
      "",
      "## > test",
      "",
      "> node --test",
      "",
      "```sh",
      "npm run test",
      "```",
      "",
    ].join("\n"),
  );
  assert.deepEqual(r.notes, []);
});

test("the packageManager field picks the runner", () => {
  const r = convert(JSON.stringify({ packageManager: "pnpm@9.1.0", scripts: { dev: "vite" } }));
  assert.match(r.markdown, /pnpm run dev/);
  const odd = convert(JSON.stringify({ packageManager: "deno@2", scripts: { dev: "vite" } }));
  assert.match(odd.markdown, /npm run dev/);
  assert.equal(odd.notes.length, 1);
});

test("script names kevin would cut are rewritten, and said so", () => {
  assert.equal(taskName("build prod"), "build-prod");
  assert.equal(taskName("test (unit)"), "test-unit");
  const r = convert(JSON.stringify({ scripts: { "build prod": "x" } }));
  assert.match(r.markdown, /## > build-prod/);
  assert.match(r.markdown, /npm run 'build prod'/);
  assert.deepEqual(r.notes, ["script 'build prod' is the task 'build-prod'"]);
});

test("colons stay, they are valid in task names", () => {
  const r = convert(JSON.stringify({ scripts: { "build:prod": "x" } }));
  assert.match(r.markdown, /## > build:prod/);
  assert.match(r.markdown, /npm run build:prod\n/);
});

test("single quotes in a script name are escaped for sh", () => {
  const r = convert(JSON.stringify({ scripts: { "it's": "x" } }));
  assert.match(r.markdown, /npm run 'it'\\''s'/);
});

test("colliding names and non-string commands are skipped with a note", () => {
  const r = convert(JSON.stringify({ scripts: { "a b": "1", "a-b": "2", bad: 3 } }));
  assert.equal(r.notes.filter((n) => n.startsWith("skipped")).length, 2);
  assert.equal((r.markdown.match(/^## > /gm) || []).length, 1);
});

test("long and multi-line commands give a one-line description", () => {
  const r = convert(JSON.stringify({ scripts: { x: `a\n  b ${"c".repeat(200)}` } }));
  const desc = r.markdown.split("\n").find((l) => l.startsWith("> "));
  assert.ok(desc.length <= 102 && desc.endsWith("..."));
});

test("errors: invalid JSON, wrong shapes, no scripts", () => {
  assert.match(convert("{").error, /not valid JSON/);
  assert.match(convert("[]").error, /must be a JSON object/);
  assert.match(convert("{}").error, /no "scripts"/);
  assert.match(convert('{"scripts":{}}').error, /no usable script/);
});

test("as a program: markdown on stdout, notes on stderr, exit code", () => {
  const bin = path.join(__dirname, "..", "src", "plugin.js");
  const ok = spawnSync("node", [bin], { input: '{"scripts":{"a b":"x"}}', encoding: "utf8" });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /## > a-b/);
  assert.match(ok.stderr, /script 'a b' is the task 'a-b'/);
  const bad = spawnSync("node", [bin], { input: "{}", encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, "");
  assert.match(bad.stderr, /no "scripts"/);
});
