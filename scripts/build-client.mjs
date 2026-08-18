/**
 * Wrap the tsc-compiled client ESM output into the dsh client-modules loader
 * format: a classic script that registers a CJS-style factory via
 * `window.__ModuleLoader__.load({ id, factory })`.
 *
 * dsh serves the bundle at `/plugins/<id>/client.js` and injects it with a
 * plain <script> tag (see `defaultLoadBundle` in dsh-client-modules), so the
 * file must be loader-form — `import`/`export` syntax would be a SyntaxError
 * and the loader would never see a registration for its graph row.
 */
import { readFileSync, writeFileSync } from "node:fs";

const target = new URL("../lib/client/index.js", import.meta.url);
let src = readFileSync(target, "utf8");

/** Pull `export const/function NAME ...` declarations into factory-local bindings. */
const exportedNames = [];
src = src.replace(/^export\s+(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm, (_m, kind, name) => {
	exportedNames.push(name);
	return `${kind} ${name}`;
});

const indent = (code) => code.split("\n").map((line) => `\t${line}`).join("\n");

const bundle = `window.__ModuleLoader__.load({
	id: "dsh-worktree-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${indent(src)}
${exportedNames.map((name) => `\t\texports.${name} = ${name};`).join("\n")}
		exports.name = "dsh-worktree-manager";
		return module.exports;
	}
});
`;

writeFileSync(target, bundle);
console.log(`dsh-worktree-manager: wrapped client bundle (exports: ${exportedNames.join(", ")})`);
