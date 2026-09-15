/**
 * 产物漂移检查：确认已提交的构建产物 lib/ 与当前源码重建结果一致。
 *
 * lib/ 已纳入版本控制，用户 `dsh plugin add github:<repo>` 直接跑产物、不做
 * 任何构建（见 README 的 Install 一节）。代价是源码改动后必须重新构建并连带
 * 提交 lib/，否则远程仓库会停留在旧产物上。本脚本把当前源码重建到临时目录，
 * 与入库的 lib/ 逐文件比对，用来在评审/提交前拦住这种漂移。
 *
 * 用法：npm run check:lib   （不一致时非零退出）
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const committedRoot = join(root, "lib");
const scratchRoot = mkdtempSync(join(tmpdir(), "dsh-worktree-manager-lib-"));

function run(args) {
	const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
	if (result.status !== 0) {
		throw new Error(`重建失败：node ${args.join(" ")}`);
	}
}

/** 相对路径 -> 文件内容，递归收集；排序保证输出稳定。 */
function collect(dir) {
	const files = new Map();
	const walk = (current) => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile()) files.set(relative(dir, full), readFileSync(full));
		}
	};
	if (statSync(dir, { throwIfNoEntry: false })) walk(dir);
	return files;
}

try {
	// 与 npm run build 同链路，只是输出根目录换成临时目录。
	run([join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json", "--outDir", scratchRoot]);
	run([join(root, "scripts/build-client.mjs"), scratchRoot]);

	const committed = collect(committedRoot);
	const rebuilt = collect(scratchRoot);

	const missing = [...rebuilt.keys()].filter((file) => !committed.has(file));
	const extra = [...committed.keys()].filter((file) => !rebuilt.has(file));
	const changed = [...rebuilt.keys()].filter(
		(file) => committed.has(file) && !committed.get(file).equals(rebuilt.get(file)),
	);

	if (missing.length === 0 && extra.length === 0 && changed.length === 0) {
		console.log(`lib/: ${committed.size} 个产物与当前源码一致`);
	} else {
		console.error("lib/ 与当前源码不一致，请运行 npm run build 后连同 lib/ 一起提交：");
		for (const file of missing) console.error(`  缺少  lib/${file}`);
		for (const file of extra) console.error(`  多余  lib/${file}`);
		for (const file of changed) console.error(`  内容不同  lib/${file}`);
		process.exitCode = 1;
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	rmSync(scratchRoot, { recursive: true, force: true });
}
