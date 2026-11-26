# kevin-plugin-node

A [kevin](https://github.com/mtxr/kevin) converter plugin that turns the
`scripts` of a `package.json` into kevin tasks. It is written in JavaScript, in
one dependency-free file ([`src/plugin.js`](src/plugin.js)), and compiled to
WebAssembly with [Javy](https://github.com/bytecodealliance/javy), so it runs
in kevin's sandbox like any other plugin (see kevin's `PLUGINS.md`).

It exists as the worked example of "write a plugin in a language that is not
Zig".

> **Status: experimental.** It needs a kevin with WebAssembly SIMD support
> ([mtxr/kevin#14](https://github.com/mtxr/kevin/pull/14)); older builds reject
> the module with `v128 value type requires simd feature`.

## Install

```sh
curl -LO https://github.com/mtxr/kevin-plugin-node/releases/latest/download/node.wasm
kevin --plugin-add node.wasm           # copies it in and records its sha256
echo 'package.json -> node' >> .kevinrc
kevin                                  # the scripts of package.json are tasks
```

Each release also carries `node.wasm.sha256` and a signed build provenance
(`gh attestation verify node.wasm --repo mtxr/kevin-plugin-node`). The module
runs in kevin's sandbox: no network, no filesystem, no processes.

## What it produces

```json
{ "packageManager": "pnpm@9.1.0", "scripts": { "build": "tsc -p .", "test unit": "node --test" } }
```

becomes

````markdown
# Tasks

## > build

> tsc -p .

```sh
pnpm run build
```

## > test-unit

> node --test

```sh
pnpm run 'test unit'
```
````

- One task per script; the description is the script's command (one line, cut
  at 100 characters), so `kevin` lists what each task does.
- The runner comes from the `packageManager` field (`npm`, `pnpm`, `yarn`,
  `bun`), otherwise `npm`. Lockfiles are not looked at: the sandbox gives a
  plugin no filesystem.
- kevin cuts a task name at the first space, so `test unit` becomes
  `test-unit` (the script is still run by its real name). Each rewrite is
  reported as a note.
- Skipped with a note: scripts whose command is not a string, and scripts
  whose name collides with another after rewriting.
- Exit code 1, with a message, for invalid JSON or when there is no usable
  script.

Not handled yet: `workspaces` (a monorepo), arguments forwarded to the script.

## Develop

Under Node the same file runs as a plain program, which is the fast loop:

```sh
npm test                                  # unit tests plus the program contract
node src/plugin.js < package.json         # Markdown on stdout, notes on stderr
```

`convert()` is pure and must stay free of Node-only APIs: the WebAssembly build
has no `fs`, no `process`, no `require`. Only the I/O at the bottom of the file
differs between Node and Javy.

## Build the WebAssembly module

```sh
npm run build        # downloads Javy v9.1.0 (sha256 pinned) into .tools/, writes dist/node.wasm
KEVIN=/path/to/kevin sh scripts/e2e.sh   # runs it in a real kevin (needs SIMD support)
```

`e2e.sh` converts a fixture, registers the module, runs a task from
`package.json` through `.kevinrc`, and checks that a failure says why.

## Release

CI (`.github/workflows/ci.yml`) runs the Node tests, builds the module and runs
`e2e.sh` against kevin built from source (`mtxr/kevin`, `main`) on every push
and pull request.

To publish, bump `version` in `package.json`, merge, then push a tag:

```sh
git tag v0.1.0 && git push origin v0.1.0
```

`release.yml` checks that the tag matches `package.json`, repeats the tests and
the e2e run, writes `node.wasm.sha256`, attests the build provenance and creates
the GitHub release with `node.wasm` and the checksum. The asset name is stable,
so `releases/latest/download/node.wasm` always points at the newest one.

## How errors look

A JavaScript module cannot choose an exit code: an error ends it with a trap.
`run()` writes the reason on stderr first, and kevin shows it:

```text
kevin: plugin 'node' failed: no "scripts" object found (Exception: unreachable)
```

## License

MIT, see [LICENSE](LICENSE).
