import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import z from "@deepseek-ai/schemastery";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import "@deepseek-ai/cordis";
[...Object.values({
	httpProxy: ["http_proxy", "HTTP_PROXY"],
	httpsProxy: ["https_proxy", "HTTPS_PROXY"],
	noProxy: ["no_proxy", "NO_PROXY"]
}).flat()];
/** One IPv4 octet, so a loopback match cannot accept `127.999.1.1`. */
const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
new RegExp(`^127\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);
//#endregion
//#region packages/subprocess/subprocess/src/index.ts
/** Executable lookup completed without finding an executable file. */
var SubprocessExecutableNotFoundError = class extends Error {
	/**
	* @param message - provider-specific lookup diagnostic.
	* @param options - original provider failure, when available.
	*/
	constructor(message, options) {
		super(message, options);
		this.name = "SubprocessExecutableNotFoundError";
	}
};
//#endregion
//#region packages/git/git-command/src/index.ts
/**
* One git command through the subprocess seam.
*
* Two capabilities run git here — the turn change recorder and the browser's
* repository panel — and both must run it the same way: never shell-interpreted,
* never waiting on a credential prompt, never reading the user's ambient git
* configuration, never taking an optional lock under the user, and always under
* a caller-owned deadline with bounded output. This package is that one home.
* It also parses the one porcelain form both callers read back: NUL-terminated
* `--numstat` records.
*
* A nonzero exit is data the caller classifies, so nothing here raises one; a
* command that times out, is aborted, or cannot spawn is an exception, and the
* caller owns the cause because the process outcome carries none.
*
* @module @deepseek-ai/dsh-git-command
*/
/** Milliseconds a terminated git range has to exit before it is killed. */
const TERMINATE_GRACE_MS = 2e3;
/** Bytes of one command's stderr kept as its diagnostic tail. */
const STDERR_TAIL_BYTES = 16 * 1024;
/**
* Git's non-interactive environment, layered under every command's own entries.
*
* `GIT_CONFIG_COUNT=0` makes ambient indexed configuration inert: the subprocess
* credential scrub already removes `GIT_CONFIG_KEY_n` (its name matches `KEY`),
* and this makes any survivor meaningless. `GIT_TERMINAL_PROMPT=0` keeps a child
* from waiting on a prompt nobody can answer. `GIT_OPTIONAL_LOCKS=0` stops git
* refreshing an index under the user. `LC_ALL=C` is the stable wording that
* callers classify "not a repository" by.
*/
const GIT_ENV = {
	GIT_CONFIG_COUNT: "0",
	GIT_TERMINAL_PROMPT: "0",
	GIT_OPTIONAL_LOCKS: "0",
	LC_ALL: "C"
};
/** Runs one resolved git executable with a deadline and bounded output. */
var GitRunner = class {
	subprocess;
	executable;
	limits;
	/**
	* @param subprocess - the process seam every command spawns through.
	* @param executable - resolved absolute git executable.
	* @param limits - deadline and output cap for one command.
	*/
	constructor(subprocess, executable, limits) {
		this.subprocess = subprocess;
		this.executable = executable;
		this.limits = limits;
	}
	/**
	* Run one git subcommand to settlement.
	* @param args - arguments after the executable; never shell-interpreted.
	* @param options - directory, cancellation, and per-command overrides.
	* @returns the exit facts and the retained stdout and stderr.
	* @throws Error when the deadline or the caller's signal ended the command, or when the spawn itself failed.
	*/
	async run(args, options) {
		const timeout = AbortSignal.timeout(this.limits.timeoutMs);
		const signal = AbortSignal.any([options.signal, timeout]);
		const handle = this.subprocess.spawn({
			argv: [this.executable, ...args],
			cwd: options.cwd,
			stdio: {
				stdin: options.stdin === void 0 ? "ignore" : { data: options.stdin },
				stdout: { maxBytes: options.maxBytes ?? this.limits.outputMaxBytes },
				stderr: { maxBytes: STDERR_TAIL_BYTES }
			},
			graceMs: TERMINATE_GRACE_MS,
			signal,
			env: {
				...GIT_ENV,
				...options.env
			}
		});
		const outcome = await handle.done;
		if (signal.aborted) {
			const cause = timeout.aborted ? `timed out after ${this.limits.timeoutMs}ms` : "was aborted";
			throw new Error(`git ${args.join(" ")} ${cause}`);
		}
		/* v8 ignore start -- collect-mode stdio always yields both readers. */
		const stdout = handle.collected.stdout?.readFrom(0) ?? {
			text: "",
			lossy: false
		};
		const stderr = handle.collected.stderr?.readFrom(0).text ?? "";
		/* v8 ignore stop */
		return {
			exitCode: outcome.exitCode,
			stdout: stdout.text,
			stderr,
			truncated: stdout.lossy
		};
	}
};
/**
* Resolve the git executable this host can run.
*
* On macOS the `/usr/bin/git` developer-tools stub opens an installer dialog
* instead of running, so it counts as absent until the tools are selected.
* @param subprocess - the process seam used to resolve and probe.
* @param signal - the caller's lifetime; cancels the lookup and the probe.
* @returns the executable path, or the reason none is usable.
* @throws Error when the lookup fails for a reason other than a missing executable.
*/
async function resolveGitExecutable(subprocess, signal) {
	const executable = await subprocess.resolveExecutable("git", void 0, signal).catch((error) => {
		if (error instanceof SubprocessExecutableNotFoundError) return void 0;
		throw error;
	});
	if (executable === void 0) return { reason: "missing" };
	if (process.platform !== "darwin" || executable !== "/usr/bin/git") return { executable };
	return (await subprocess.spawn({
		argv: ["/usr/bin/xcode-select", "-p"],
		cwd: homedir(),
		stdio: {
			stdin: "ignore",
			stdout: { maxBytes: 4096 },
			stderr: { maxBytes: 4096 }
		},
		graceMs: 1e3,
		signal
	}).done.catch(() => ({ exitCode: null }))).exitCode === 0 ? { executable } : { reason: "developer-tools" };
}
//#endregion
//#region packages/api/session-manager-controller/lib/types/index.js
/**
* Session manager Remote owner: deletes one Session by moving its durable log
* directory into a trash folder, so the disk is reclaimed while the delete stays
* reversible for the retention window, and archives the Session in the same
* operation so its row leaves the default Sidebar list. The same namespace lists
* the trash and restores or purges one entry.
*
* The Session log itself stays append-only: this service never edits or
* truncates a log, it relocates a whole directory, and the trash sweep only
* removes directories the retention window has already expired.
*
* @module @deepseek-ai/dsh-session-manager
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** The Harness home directory name under the operating-system home. */
const HOME_DIR_NAME = ".dsh";
/** Milliseconds in one day. */
const DAY_MS = 864e5;
/** Read the kind of each path from `git status --porcelain=v1 -z`. */
function parseGitStatus(output) {
	const files = {};
	const entries = output.split("\0");
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index];
		if (entry === void 0 || entry.length < 4) continue;
		const x = entry[0];
		const y = entry[1];
		if (x === "R" || x === "C" || y === "R" || y === "C") index += 1;
		files[entry.slice(3)] = x === "?" || x === "A" ? "added" : x === "D" || y === "D" ? "deleted" : x === "R" || y === "R" ? "renamed" : "modified";
	}
	return files;
}
/** Record each trashed directory carries, so a restore finds its way back. */
const MANIFEST_NAME = "session-manager.json";
/**
* Resolve the Harness home the same way the launcher does.
* @returns the normalized absolute Harness home path.
*/
function dshHome() {
	const configured = process.env.DSH_HOME;
	if (configured !== void 0 && configured.trim().length > 0) return resolve(configured);
	return join(homedir(), HOME_DIR_NAME);
}
/** Host Remote owner of the `sessionManager` namespace. */
let SessionManagerController = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _delete_decorators;
	let _listTrash_decorators;
	let _restoreTrash_decorators;
	let _purgeTrash_decorators;
	let _trash_decorators;
	let _sweepNow_decorators;
	let _gitStatus_decorators;
	return class SessionManagerController extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_delete_decorators = [Remote("delete")];
			_listTrash_decorators = [Remote("listTrash")];
			_restoreTrash_decorators = [Remote("restoreTrash")];
			_purgeTrash_decorators = [Remote("purgeTrash")];
			_trash_decorators = [Remote("trash")];
			_sweepNow_decorators = [Remote("sweep")];
			_gitStatus_decorators = [Remote("gitStatus")];
			__esDecorate(this, null, _delete_decorators, {
				kind: "method",
				name: "delete",
				static: false,
				private: false,
				access: {
					has: (obj) => "delete" in obj,
					get: (obj) => obj.delete
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listTrash_decorators, {
				kind: "method",
				name: "listTrash",
				static: false,
				private: false,
				access: {
					has: (obj) => "listTrash" in obj,
					get: (obj) => obj.listTrash
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _restoreTrash_decorators, {
				kind: "method",
				name: "restoreTrash",
				static: false,
				private: false,
				access: {
					has: (obj) => "restoreTrash" in obj,
					get: (obj) => obj.restoreTrash
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _purgeTrash_decorators, {
				kind: "method",
				name: "purgeTrash",
				static: false,
				private: false,
				access: {
					has: (obj) => "purgeTrash" in obj,
					get: (obj) => obj.purgeTrash
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _trash_decorators, {
				kind: "method",
				name: "trash",
				static: false,
				private: false,
				access: {
					has: (obj) => "trash" in obj,
					get: (obj) => obj.trash
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _sweepNow_decorators, {
				kind: "method",
				name: "sweepNow",
				static: false,
				private: false,
				access: {
					has: (obj) => "sweepNow" in obj,
					get: (obj) => obj.sweepNow
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _gitStatus_decorators, {
				kind: "method",
				name: "gitStatus",
				static: false,
				private: false,
				access: {
					has: (obj) => "gitStatus" in obj,
					get: (obj) => obj.gitStatus
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		config = __runInitializers(this, _instanceExtraInitializers);
		static inject = ["workspaceRegistry", "subprocess"];
		static Config = z.object({
			sessionsRoot: z.string().default(""),
			trashDir: z.string().default(""),
			retentionDays: z.number().step(1).min(0).default(30),
			sweepMinutes: z.number().step(1).min(0).default(60)
		});
		sessionsRoot;
		trashDir;
		timer;
		/**
		* @param ctx - Host context carrying the Workspace registry the archive write goes through.
		* @param config - locations and retention window for the trash.
		*/
		constructor(ctx, config) {
			super(ctx, "sessionManager", { namespace: "sessionManager" });
			this.config = config;
			const home = dshHome();
			this.sessionsRoot = config.sessionsRoot === "" ? join(home, "sessions") : config.sessionsRoot;
			this.trashDir = config.trashDir === "" ? join(home, "trash", "sessions") : config.trashDir;
			this.sweep();
			if (config.sweepMinutes > 0) {
				this.timer = setInterval(() => {
					this.sweep();
				}, config.sweepMinutes * 6e4);
				this.timer.unref();
			} else this.timer = void 0;
		}
		/**
		* Move one Session's log directory to the trash and archive the Session, so its
		* row leaves the default list and its disk is reclaimed.
		* @param request - the Session to delete.
		* @returns whether a directory was moved, and where.
		*/
		async delete(request) {
			const sessionId = request.sessionId;
			const directory = await this.findSessionDir(request.sessionId);
			if (directory === void 0) return { trashed: false };
			const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/gu, "-");
			const target = join(this.trashDir, `${stamp}-${request.sessionId}`);
			await mkdir(this.trashDir, { recursive: true });
			await this.move(directory, target);
			const manifest = {
				sessionId: request.sessionId,
				source: directory,
				trashedAt: (/* @__PURE__ */ new Date()).toISOString(),
				...request.displayTitle === void 0 || request.displayTitle === "" ? {} : { title: request.displayTitle }
			};
			await writeFile(join(target, MANIFEST_NAME), `${JSON.stringify(manifest)}\n`, "utf8");
			await this.ctx.workspaceRegistry.archiveSession(sessionId, { stopActivity: true });
			return {
				trashed: true,
				trashPath: target
			};
		}
		/**
		* List what the trash currently holds, newest first.
		* @returns one entry per trashed directory.
		*/
		async listTrash() {
			return (await this.readTrash()).map((entry) => ({
				name: entry.name,
				sessionId: entry.manifest?.sessionId ?? sessionIdOf(entry.name),
				title: entry.manifest?.title ?? entry.manifest?.sessionId ?? sessionIdOf(entry.name),
				trashedAt: entry.manifest?.trashedAt ?? new Date(entry.mtimeMs).toISOString(),
				bytes: entry.bytes
			})).sort((left, right) => right.trashedAt.localeCompare(left.trashedAt));
		}
		/**
		* Move one trashed directory back to the Session directory it came from.
		* @param request - the trash entry to restore.
		* @returns whether a directory was moved back.
		*/
		async restoreTrash(request) {
			const path = join(this.trashDir, request.name);
			const manifest = await this.readManifest(path);
			if (manifest === void 0) return {
				restored: false,
				purged: false
			};
			await mkdir(dirname(manifest.source), { recursive: true });
			await rm(manifest.source, {
				recursive: true,
				force: true
			});
			await this.move(path, manifest.source);
			await this.ctx.workspaceRegistry.unarchiveSession(manifest.sessionId);
			return {
				restored: true,
				purged: false
			};
		}
		/**
		* Remove one trashed directory for good.
		* @param request - the trash entry to purge.
		* @returns whether a directory was removed.
		*/
		async purgeTrash(request) {
			const path = join(this.trashDir, request.name);
			try {
				await stat(path);
			} catch {
				return {
					restored: false,
					purged: false
				};
			}
			await rm(path, {
				recursive: true,
				force: true
			});
			return {
				restored: false,
				purged: true
			};
		}
		/**
		* Report the trash's occupancy and the window that keeps a delete reversible.
		* @returns the count, the bytes, and the retention window.
		*/
		async trash() {
			const entries = await this.readTrash();
			let bytes = 0;
			for (const entry of entries) bytes += entry.bytes;
			return {
				count: entries.length,
				bytes,
				retentionDays: this.config.retentionDays
			};
		}
		/**
		* Remove every trashed directory past the retention window.
		* @returns the number of directories purged.
		*/
		async sweepNow() {
			return this.sweep();
		}
		/**
		* Read the working tree's changed paths so the file tree can colour them.
		* @param request - absolute workspace directory whose repository is read.
		* @returns changed paths relative to the repository root, or unavailable when git cannot answer.
		*/
		async gitStatus(request) {
			const signal = AbortSignal.timeout(15e3);
			const resolution = await resolveGitExecutable(this.ctx.subprocess, signal);
			if (!("executable" in resolution)) return {
				available: false,
				files: {}
			};
			const result = await new GitRunner(this.ctx.subprocess, resolution.executable, {
				timeoutMs: 15e3,
				outputMaxBytes: 4 * 1024 * 1024
			}).run([
				"status",
				"--porcelain=v1",
				"-z",
				"--untracked-files=all"
			], {
				cwd: request.cwd,
				signal
			});
			if (result.exitCode !== 0) return {
				available: false,
				files: {}
			};
			return {
				available: true,
				files: parseGitStatus(result.stdout)
			};
		}
		/** Move a directory, falling back to copy-and-remove across filesystems. */
		async move(from, to) {
			try {
				await rename(from, to);
			} catch {
				await cp(from, to, {
					recursive: true,
					force: true
				});
				await rm(from, {
					recursive: true,
					force: true
				});
			}
		}
		/** Purge the trash entries whose retention window has expired. */
		async sweep() {
			const cutoff = Date.now() - this.config.retentionDays * DAY_MS;
			let purged = 0;
			for (const entry of await this.readTrash()) {
				const trashedAt = entry.manifest?.trashedAt;
				const stamp = trashedAt === void 0 ? entry.mtimeMs : Date.parse(trashedAt);
				if (!Number.isFinite(stamp) || stamp > cutoff) continue;
				await rm(entry.path, {
					recursive: true,
					force: true
				});
				purged += 1;
			}
			return purged;
		}
		/** Every directory currently in the trash, with the facts the sweep compares. */
		async readTrash() {
			let names;
			try {
				names = await readdir(this.trashDir);
			} catch {
				return [];
			}
			const entries = [];
			for (const name of names) {
				const path = join(this.trashDir, name);
				try {
					const info = await stat(path);
					if (!info.isDirectory()) continue;
					entries.push({
						name,
						path,
						bytes: await directoryBytes(path),
						mtimeMs: info.mtimeMs,
						manifest: await this.readManifest(path)
					});
				} catch {}
			}
			return entries;
		}
		/** One trash directory's manifest, when it carries a readable record. */
		async readManifest(path) {
			try {
				const raw = JSON.parse(await readFile(join(path, MANIFEST_NAME), "utf8"));
				if (typeof raw.sessionId !== "string" || typeof raw.source !== "string" || typeof raw.trashedAt !== "string") return void 0;
				return {
					sessionId: raw.sessionId,
					source: raw.source,
					trashedAt: raw.trashedAt,
					...typeof raw.title === "string" ? { title: raw.title } : {}
				};
			} catch {
				return;
			}
		}
		/**
		* Find one Session's on-disk directory by its id.
		* @param sessionId - the Session whose directory to locate.
		* @returns the absolute directory, or undefined when no project holds it.
		*/
		async findSessionDir(sessionId) {
			let projects;
			try {
				projects = await readdir(this.sessionsRoot);
			} catch {
				return;
			}
			for (const project of projects) {
				const candidate = join(this.sessionsRoot, project, sessionId);
				try {
					if ((await stat(candidate)).isDirectory()) return candidate;
				} catch {}
			}
		}
	};
})();
/** The Session id a trash directory name carries after its timestamp prefix. */
function sessionIdOf(name) {
	const marker = name.indexOf("session-");
	return marker === -1 ? name : name.slice(marker);
}
/** Total bytes of one directory tree, for the trash report. */
async function directoryBytes(root) {
	let total = 0;
	let entries;
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) {
			total += await directoryBytes(path);
			continue;
		}
		try {
			total += (await stat(path)).size;
		} catch {}
	}
	return total;
}
//#endregion
export { SessionManagerController, SessionManagerController as default };
