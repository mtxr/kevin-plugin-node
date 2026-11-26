// kevin converter plugin: package.json -> kevin Markdown.
//
// Contract (see kevin's PLUGINS.md): stdin is the package.json, stdout is the
// kevin Markdown, stderr carries notes (one per line), a non-zero exit is an
// error. The same file runs in two places:
//
//   * compiled to WebAssembly with Javy (QuickJS), where I/O is Javy.IO.readSync
//     and Javy.IO.writeSync;
//   * under Node, for development and tests: `node src/plugin.js < package.json`.
//
// Everything that matters is in convert(), which is pure: it takes the text of
// a package.json and returns the Markdown and the notes. It must stay free of
// Node-only APIs, because the WebAssembly build has none of them.

"use strict";

const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"];

// kevin reads a task name up to the first space, and `(` / `[` start argument
// groups, so a script name is rewritten into something kevin keeps whole.
function taskName(script) {
  return script.replace(/[\s()[\]]+/g, "-").replace(/^-+|-+$/g, "");
}

// Quote for sh only when needed, so the common case stays readable.
function shellWord(word) {
  return /^[A-Za-z0-9_.:@/+=-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`;
}

// The package manager named by the `packageManager` field ("pnpm@9.1.0"), or
// npm. Lockfiles are not consulted: the sandbox gives the plugin no filesystem.
function packageManager(pkg, notes) {
  const field = pkg.packageManager;
  if (typeof field !== "string") return "npm";
  const name = field.split("@")[0];
  if (PACKAGE_MANAGERS.includes(name)) return name;
  notes.push(`unknown packageManager '${field}', using npm`);
  return "npm";
}

// A one-line description for `kevin --help`: the command the script runs.
function describe(command) {
  const line = String(command).replace(/\s+/g, " ").trim();
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

function convert(text) {
  const notes = [];
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch (e) {
    return { error: `not valid JSON: ${e.message}`, notes };
  }
  if (pkg === null || typeof pkg !== "object" || Array.isArray(pkg)) {
    return { error: "package.json must be a JSON object", notes };
  }
  const scripts = pkg.scripts;
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) {
    return { error: 'no "scripts" object found', notes };
  }

  const pm = packageManager(pkg, notes);
  const seen = new Set();
  let out = "# Tasks\n";
  for (const [script, command] of Object.entries(scripts)) {
    if (typeof command !== "string") {
      notes.push(`skipped script '${script}': the command is not a string`);
      continue;
    }
    const name = taskName(script);
    if (name === "") {
      notes.push(`skipped script '${script}': no usable task name`);
      continue;
    }
    if (seen.has(name)) {
      notes.push(`skipped script '${script}': another script already maps to task '${name}'`);
      continue;
    }
    seen.add(name);
    if (name !== script) notes.push(`script '${script}' is the task '${name}'`);

    out += `\n## > ${name}\n\n> ${describe(command)}\n\n\`\`\`sh\n${pm} run ${shellWord(script)}\n\`\`\`\n`;
  }
  if (seen.size === 0) return { error: 'the "scripts" object has no usable script', notes };
  return { markdown: out, notes };
}

// ---- I/O ------------------------------------------------------------------

class Exit extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}

function run(io) {
  const result = convert(io.readStdin());
  for (const note of result.notes) io.writeStderr(`${note}\n`);
  if (result.error !== undefined) {
    io.writeStderr(`${result.error}\n`);
    throw new Exit(1);
  }
  io.writeStdout(result.markdown);
}

function javyIO() {
  const encoder = new TextEncoder();
  return {
    readStdin() {
      const chunks = [];
      let total = 0;
      for (;;) {
        const buf = new Uint8Array(65536);
        const n = Javy.IO.readSync(0, buf);
        if (n === 0) break;
        chunks.push(buf.subarray(0, n));
        total += n;
      }
      const all = new Uint8Array(total);
      let at = 0;
      for (const c of chunks) {
        all.set(c, at);
        at += c.length;
      }
      return new TextDecoder().decode(all);
    },
    writeStdout: (s) => Javy.IO.writeSync(1, encoder.encode(s)),
    writeStderr: (s) => Javy.IO.writeSync(2, encoder.encode(s)),
  };
}

function nodeIO() {
  const fs = require("node:fs");
  return {
    readStdin: () => fs.readFileSync(0, "utf8"),
    writeStdout: (s) => fs.writeSync(1, s),
    writeStderr: (s) => fs.writeSync(2, s),
  };
}

if (typeof Javy !== "undefined") {
  // WebAssembly (Javy). A thrown Exit ends the run with a failure.
  run(javyIO());
} else if (typeof module !== "undefined") {
  if (require.main === module) {
    try {
      run(nodeIO());
    } catch (e) {
      if (!(e instanceof Exit)) throw e;
      process.exitCode = e.code;
    }
  }
  module.exports = { convert, taskName };
}
