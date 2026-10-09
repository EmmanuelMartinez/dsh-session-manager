import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import z from "@deepseek-ai/schemastery";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/index.js
/**
* Session manager Remote owner: deletes one Session by moving its durable log
* directory into a trash folder, so the disk is reclaimed while the delete stays
* reversible for the retention window, and archives the Session in the same
* operation so its row leaves the default Sidebar list.
*
* The Session log itself stays append-only: this service never edits or
* truncates a log, it relocates a whole directory, and the trash sweep only
* removes directories the retention window has already expired.
*
* @module @deepseek-ai/dsh-api-session-manager-controller
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
	let _trash_decorators;
	let _sweepNow_decorators;
	return class SessionManagerController extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_delete_decorators = [Remote("delete")];
			_trash_decorators = [Remote("trash")];
			_sweepNow_decorators = [Remote("sweep")];
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
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		config = __runInitializers(this, _instanceExtraInitializers);
		static inject = ["workspaceRegistry"];
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
			try {
				await rename(directory, target);
			} catch {
				await cp(directory, target, {
					recursive: true,
					force: true
				});
				await rm(directory, {
					recursive: true,
					force: true
				});
			}
			await this.ctx.workspaceRegistry.archiveSession(sessionId, { stopActivity: true });
			return {
				trashed: true,
				trashPath: target
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
		/** Purge the trash entries whose retention window has expired. */
		async sweep() {
			const cutoff = Date.now() - this.config.retentionDays * DAY_MS;
			let purged = 0;
			for (const entry of await this.readTrash()) {
				if (entry.mtimeMs > cutoff) continue;
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
						path,
						bytes: await directoryBytes(path),
						mtimeMs: info.mtimeMs
					});
				} catch {}
			}
			return entries;
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
