/**
 * Bundle the client half of dsh-worktree-manager into the dsh client-modules
 * loader format: a classic script that registers a CJS-style factory via
 * `window.__ModuleLoader__.load({ id, factory })`.
 *
 * dsh serves the bundle at `/plugins/<id>/client.js` and injects it with a
 * plain <script> tag (see `defaultLoadBundle` in dsh-client-modules), so the
 * file must be loader-form — `import`/`export` syntax would be a SyntaxError
 * and the loader would never see a registration for its graph row.
 *
 * Platform modules (react, react/jsx-runtime, cordis, dsh-client-ui-slots, …)
 * are externals resolved at runtime through the factory's `require` parameter
 * (the loader module table). esbuild marks them external and emits CJS
 * `require()` calls for them; the banner/footer wrap the CJS body into the
 * loader factory closure, where `require` is the factory parameter and
 * `module`/`exports` are local bindings the CJS body writes into.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const PLUGIN_ID = "dsh-worktree-manager";

/** Platform modules the dsh shell seeds into the loader module table. */
const EXTERNALS = [
	"react",
	"react/jsx-runtime",
	"react-dom",
	"react-dom/client",
	"@deepseek-ai/cordis",
	"@deepseek-ai/dsh-client-ui-slots",
	"@deepseek-ai/dsh-client-web-react",
	"@deepseek-ai/dsh-client-ui-primitives",
	"@deepseek-ai/dsh-client-ui-attachment",
	"@deepseek-ai/dsh-client-schema-form",
];

const result = await build({
	entryPoints: ["src/client/index.ts"],
	bundle: true,
	format: "cjs",
	platform: "browser",
	target: "es2022",
	jsx: "automatic",
	external: EXTERNALS,
	write: false,
	logLevel: "info",
	// The banner opens the loader factory and declares `module`/`exports`/
	// `require` as local bindings the CJS body expects. The footer stamps the
	// plugin name and returns module.exports.
	banner: {
		js: [
			`window.__ModuleLoader__.load({`,
			`\tid: ${JSON.stringify(PLUGIN_ID)},`,
			`\tfactory: (require) => {`,
			`\t\tvar module = { exports: {} };`,
			`\t\tvar exports = module.exports;`,
			`\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });`,
		].join("\n"),
	},
	footer: {
		js: [
			`\t\tmodule.exports.name = ${JSON.stringify(PLUGIN_ID)};`,
			`\t\treturn module.exports;`,
			`\t}`,
			`});`,
		].join("\n"),
	},
});

let code = result.outputFiles[0].text;

// Strip esbuild's "use strict" — the factory closure is not strict-mode and
// the directive is noisy inside the wrapper.
code = code.replace(/^"use strict";\s*\n/gm, "");

const target = fileURLToPath(new URL("../lib/client/index.js", import.meta.url));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, code);
console.log(`${PLUGIN_ID}: bundled client (loader format)`);
