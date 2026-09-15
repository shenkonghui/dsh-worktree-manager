window.__ModuleLoader__.load({
	id: "dsh-worktree-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply2,
  inject: () => inject2
});
module.exports = __toCommonJS(index_exports);

// official-workspace:virtual:dsh-official-workspace-client
var cordis = __toESM(require("@deepseek-ai/cordis"));
var store = __toESM(require("@deepseek-ai/dsh-client-store"));
var jsxRuntime = __toESM(require("react/jsx-runtime"));
var react = __toESM(require("react"));
var primitives = __toESM(require("@deepseek-ai/dsh-client-ui-primitives"));
var modules = {
  "@deepseek-ai/cordis": cordis,
  "@deepseek-ai/dsh-client-store": store,
  "react/jsx-runtime": jsxRuntime,
  "react": react,
  "@deepseek-ai/dsh-client-ui-primitives": primitives
};
var official = ((require2) => {
  var module2 = { exports: {} };
  var exports = module2.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  let _deepseek_ai_cordis = require2("@deepseek-ai/cordis");
  let _deepseek_ai_dsh_client_store = require2("@deepseek-ai/dsh-client-store");
  let react_jsx_runtime = require2("react/jsx-runtime");
  let react2 = require2("react");
  let _deepseek_ai_dsh_client_ui_primitives = require2("@deepseek-ai/dsh-client-ui-primitives");
  var DirectoryBrowseError = class extends Error {
    rpcError;
    name = "DirectoryBrowseError";
    /** @param rpcError - Host directory business failure. */
    constructor(rpcError) {
      super(`directory browse failed: ${rpcError.code}: ${rpcError.message}`);
      this.rpcError = rpcError;
    }
  };
  var UiWorkspaceService = class extends _deepseek_ai_cordis.Service {
    directoryPicker;
    workspaces;
    sessions;
    connecting = /* @__PURE__ */ new Map();
    /**
    * @param ctx - Client root Context.
    * @param directoryPicker - the directory-picking Remote namespace.
    * @param workspaces - pure Workspace Controller.
    * @param sessions - pure Session Controller.
    */
    constructor(ctx, directoryPicker, workspaces, sessions) {
      super(ctx, "uiWorkspace");
      this.directoryPicker = directoryPicker;
      this.workspaces = workspaces;
      this.sessions = sessions;
      ctx.effect(() => this.watchNavigation(), "ui-workspace: Workspace navigation policy");
    }
    async connectWorkspace(workspaceId) {
      const workspace = this.workspaces.list.getSnapshot().items.find((item) => item.workspaceId === workspaceId);
      if (workspace === void 0) throw new Error(`uiWorkspace.connectWorkspace: unknown workspace ${workspaceId}`);
      const inflight = this.connecting.get(workspaceId);
      if (inflight !== void 0) return inflight;
      const archived = this.workspaces.list.getSnapshot().archivedSessionIds;
      const sessions = this.sessions.list.getSnapshot();
      for (const id of sessions.ids) {
        const summary = sessions.byId[id];
        if (summary !== void 0 && summary.blank && summary.cwd === workspace.path && workspace.sessionIds.includes(summary.id) && !archived.includes(summary.id)) return summary.id;
      }
      const attempt = this.sessions.create({ workspaceId }).finally(() => {
        this.connecting.delete(workspaceId);
      });
      this.connecting.set(workspaceId, attempt);
      return attempt;
    }
    startSession(workspaceId) {
      const workspace = this.workspaces.list.getSnapshot();
      const sessions = this.sessions.list.getSnapshot();
      const current = sessions.current;
      const currentWorkspaceId = current === void 0 ? void 0 : workspace.items.find((item) => item.sessionIds.includes(current))?.workspaceId;
      const recent = workspace.phase === "ready" && sessions.phase === "ready" ? recentWorkspace(workspace.items, sessions.byId) : void 0;
      const target = workspaceId ?? currentWorkspaceId ?? recent;
      if (target === void 0) {
        this.sessions.clear();
        return;
      }
      this.connectWorkspace(target).then((sessionId) => {
        this.sessions.open(sessionId);
      }, (reason) => {
        console.warn("new session failed:", reason);
      });
    }
    async archiveSession(sessionId) {
      await this.workspaces.archiveSession(sessionId);
    }
    async pickDirectory() {
      const result = await this.directoryPicker.pick();
      if (!result.ok) throw new Error(`directory picker failed: ${result.error.message}`);
      return result.value;
    }
    async listDirectory(path, signal) {
      const result = await this.directoryPicker.list(path, signal);
      if (!result.ok) throw new DirectoryBrowseError(result.error);
      return result.value;
    }
    async createDirectory(path, name) {
      const result = await this.directoryPicker.createDirectory(path, name);
      if (!result.ok) throw new DirectoryBrowseError(result.error);
      return result.value;
    }
    watchNavigation() {
      let initial = "waiting";
      let disposed = false;
      const reconcile = () => {
        if (disposed) return;
        if (this.clearArchivedCurrent()) return;
        if (initial !== "waiting") return;
        const workspace = this.workspaces.list.getSnapshot();
        const sessions = this.sessions.list.getSnapshot();
        if (workspace.phase !== "ready" || sessions.phase !== "ready") return;
        if (sessions.current !== void 0) {
          initial = "done";
          return;
        }
        const target = recentWorkspace(workspace.items, sessions.byId);
        if (target === void 0) {
          initial = "done";
          return;
        }
        initial = "connecting";
        this.connectWorkspace(target).then((sessionId) => {
          if (disposed) return;
          if (this.sessions.list.getSnapshot().current === void 0) this.sessions.open(sessionId);
          initial = "done";
        }, (reason) => {
          if (disposed) return;
          initial = "waiting";
          console.warn("initial workspace selection failed:", reason);
        });
      };
      const disposeWorkspaces = this.workspaces.list.subscribe(reconcile);
      const disposeSessions = this.sessions.list.subscribe(reconcile);
      reconcile();
      return () => {
        disposed = true;
        disposeSessions();
        disposeWorkspaces();
      };
    }
    /** @returns true when an archived current selection was cleared. */
    clearArchivedCurrent() {
      const current = this.sessions.list.getSnapshot().current;
      if (current === void 0 || !this.workspaces.list.getSnapshot().archivedSessionIds.includes(current)) return false;
      this.sessions.clear();
      return true;
    }
  };
  function recentWorkspace(workspaces, sessions) {
    let selected;
    let selectedTime = Number.NEGATIVE_INFINITY;
    for (const workspace of workspaces) {
      let latest = Number.NEGATIVE_INFINITY;
      for (const sessionId of workspace.sessionIds) {
        const session = sessions[sessionId];
        if (session !== void 0) latest = Math.max(latest, session.updatedAt);
      }
      if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(workspace.createdAt);
      if (selected === void 0 || latest > selectedTime) {
        selected = workspace.workspaceId;
        selectedTime = latest;
      }
    }
    return selected;
  }
  const FLAT_SESSION_ORDER_KEY = "__flat_session_order__";
  function createWorkspaceViewStore() {
    return (0, _deepseek_ai_dsh_client_store.defineStore)({
      init: () => ({
        groupBy: "workspace",
        orderBy: "updated",
        groupExpansion: {},
        sessionOrderByAccount: {},
        sessionUpdatedAtByAccount: {}
      }),
      persist: "dsh.workspace.view.v5",
      actions: {
        setGroupBy: (d, mode) => {
          d.groupBy = mode;
        },
        setOrderBy: (d, mode) => {
          d.orderBy = mode;
        },
        setGroupExpanded: (d, key, expanded) => {
          d.groupExpansion[key] = expanded;
        },
        retainAccountKeys: (d, workspaceKeys) => {
          const retained = new Set(workspaceKeys);
          d.groupExpansion = Object.fromEntries(Object.entries(d.groupExpansion).filter(([key]) => retained.has(key)));
          d.sessionOrderByAccount = Object.fromEntries(Object.entries(d.sessionOrderByAccount).filter(([key]) => retained.has(key)));
          d.sessionUpdatedAtByAccount = Object.fromEntries(Object.entries(d.sessionUpdatedAtByAccount).filter(([key]) => retained.has(key)));
        },
        syncSessionOrderAccount: (d, accountKey, order, updatedAt) => {
          d.sessionOrderByAccount[accountKey] = order;
          d.sessionUpdatedAtByAccount[accountKey] = updatedAt;
        },
        setSessionOrder: (d, accountKey, order) => {
          d.sessionOrderByAccount[accountKey] = order;
        }
      }
    });
  }
  function r(e) {
    var t, f, n = "";
    if ("string" == typeof e || "number" == typeof e) n += e;
    else if ("object" == typeof e) if (Array.isArray(e)) {
      var o = e.length;
      for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
    } else for (f in e) e[f] && (n && (n += " "), n += f);
    return n;
  }
  function clsx() {
    for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
    return n;
  }
  function isWindowsStylePath(value) {
    return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
  }
  function abbreviateHomePath(path, home) {
    if (home === void 0 || home === "") return path;
    if (isWindowsStylePath(path) || isWindowsStylePath(home)) return path;
    const root = home.replace(/\/+$/, "");
    if (root === "" || root === "/") return path;
    if (path.replace(/\/+$/, "") === root) return "~";
    if (path.startsWith(`${root}/`)) return `~${path.slice(root.length)}`;
    return path;
  }
  function workspaceTitleOf(path) {
    const trimmed = path.replace(/[/\\]+$/, "");
    const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    return trimmed.slice(separator + 1);
  }
  function indexSubagentDescendants(summaries) {
    const indexed = /* @__PURE__ */ new Map();
    for (const descendant of Object.values(summaries)) {
      if (descendant.origin !== "subagent") continue;
      const seen = /* @__PURE__ */ new Set();
      let current = descendant;
      while (current?.origin === "subagent" && current.parentId !== void 0 && !seen.has(current.id)) {
        seen.add(current.id);
        const aggregate = indexed.get(current.parentId);
        if (aggregate === void 0) indexed.set(current.parentId, {
          count: 1,
          runningCount: descendant.running ? 1 : 0
        });
        else {
          aggregate.count += 1;
          if (descendant.running) aggregate.runningCount += 1;
        }
        current = summaries[current.parentId];
      }
    }
    return indexed;
  }
  function workspaceLabel(cwd) {
    if (cwd === void 0 || cwd === "") return "";
    const base = workspaceTitleOf(cwd);
    return base !== "" ? base : cwd;
  }
  function byRecency(a, b) {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.id < b.id ? -1 : 1;
  }
  function sessionVisible(session, current, archived) {
    return session.origin !== "subagent" && !archived.has(session.id) && (!session.blank || session.id === current);
  }
  function sessionTitle(session) {
    return session.blank ? "" : session.displayTitle;
  }
  function hasActiveSchedule(session) {
    return (session.projectionValues?.schedule?.length ?? 0) > 0;
  }
  function buildGroup(key, workspaceId, cwd, createdAt, label, members, order) {
    const sessions = [...members];
    if (order === "recency") sessions.sort(byRecency);
    return {
      key,
      workspaceId,
      cwd,
      createdAt,
      label,
      sessions
    };
  }
  function orderedUngrouped(members, stored) {
    const byId = new Map(members.map((session) => [session.id, session]));
    const included = /* @__PURE__ */ new Set();
    const ordered = [];
    for (const key of stored) {
      const session = byId.get(key);
      if (session === void 0 || included.has(key)) continue;
      ordered.push(session);
      included.add(key);
    }
    for (const session of [...members].sort(byRecency)) {
      if (included.has(session.id)) continue;
      ordered.push(session);
    }
    return ordered;
  }
  function groupByWorkspace(list2, workspaces, archived, ungroupedOrder) {
    const groups = [];
    const accounted = /* @__PURE__ */ new Set();
    for (const workspace of workspaces) {
      const members = [];
      for (const id of workspace.sessionIds) {
        const summary = list2.byId[id];
        if (summary === void 0) continue;
        accounted.add(id);
        if (!sessionVisible(summary, list2.current, archived)) continue;
        members.push(summary);
      }
      const group = buildGroup(workspace.workspaceId, workspace.workspaceId, workspace.path, Date.parse(workspace.createdAt), workspace.title, members, "account");
      if (workspace.__dshWorktreeManagerBranch !== void 0) group.__dshWorktreeManagerBranch = workspace.__dshWorktreeManagerBranch;
      if (workspace.__dshWorktreeManagerMerged !== void 0) group.__dshWorktreeManagerMerged = workspace.__dshWorktreeManagerMerged;
      if (workspace.__dshWorktreeManagerMergeLabel !== void 0) group.__dshWorktreeManagerMergeLabel = workspace.__dshWorktreeManagerMergeLabel;
      if (workspace.__dshWorktreeManagerNested === true) group.__dshWorktreeManagerNested = true;
      if (workspace.__dshWorktreeManagerParent !== void 0) group.__dshWorktreeManagerParent = workspace.__dshWorktreeManagerParent;
      if (workspace.__dshWorktreeManagerVirtual === true) {
        group.__dshWorktreeManagerVirtual = true;
        group.__dshWorktreeManagerHost = workspace.__dshWorktreeManagerHost;
      }
      groups.push(group);
    }
    const stray = list2.ids.map((id) => list2.byId[id]).filter((s) => s !== void 0 && !accounted.has(s.id) && sessionVisible(s, list2.current, archived));
    if (stray.length > 0) groups.push(buildGroup("", void 0, void 0, void 0, "", ungroupedOrder === void 0 ? stray : orderedUngrouped(stray, ungroupedOrder), ungroupedOrder === void 0 ? "recency" : "account"));
    return groups;
  }
  function visiblePendingKind(kind) {
    switch (kind) {
      case "approval":
      case "plan-review":
      case "question":
        return kind;
      default:
        return;
    }
  }
  function sessionNode(s, descendants, pendingInteractions) {
    const pendingInteraction = visiblePendingKind(pendingInteractions.get(s.id)?.kind);
    return {
      id: s.id,
      title: sessionTitle(s),
      blank: s.blank,
      running: s.running,
      runningSubagentCount: descendants.get(s.id)?.runningCount ?? 0,
      completed: s.completed === true,
      hasActiveSchedule: hasActiveSchedule(s),
      updatedAt: s.updatedAt,
      ...s.__dshWorktreeManager === void 0 ? {} : { __dshWorktreeManager: s.__dshWorktreeManager },
      ...pendingInteraction === void 0 ? {} : { pendingInteraction }
    };
  }
  function deriveGroups(list2, workspaces, archivedSessionIds, pendingInteractions, view2) {
    const archived = new Set(archivedSessionIds);
    const expandedGroups = new Set(view2.expandedGroups);
    const descendants = indexSubagentDescendants(list2.byId);
    const currentGroup = list2.current === void 0 ? void 0 : workspaces.find((w) => w.sessionIds.includes(list2.current))?.workspaceId ?? "";
    const groups = [];
    for (const g of groupByWorkspace(list2, workspaces, archived, view2.ungroupedOrder)) {
      const expanded = expandedGroups.has(g.key);
      groups.push({
        key: g.key,
        workspaceId: g.workspaceId,
        cwd: g.cwd,
        createdAt: g.createdAt,
        label: g.label,
        ...g.__dshWorktreeManagerBranch === void 0 ? {} : { __dshWorktreeManagerBranch: g.__dshWorktreeManagerBranch },
        ...g.__dshWorktreeManagerMerged === void 0 ? {} : { __dshWorktreeManagerMerged: g.__dshWorktreeManagerMerged },
        ...g.__dshWorktreeManagerMergeLabel === void 0 ? {} : { __dshWorktreeManagerMergeLabel: g.__dshWorktreeManagerMergeLabel },
        ...g.__dshWorktreeManagerNested === true ? { __dshWorktreeManagerNested: true } : {},
        ...g.__dshWorktreeManagerParent === void 0 ? {} : { __dshWorktreeManagerParent: g.__dshWorktreeManagerParent },
        ...g.__dshWorktreeManagerVirtual === true ? { __dshWorktreeManagerVirtual: true, __dshWorktreeManagerHost: g.__dshWorktreeManagerHost, workspaceId: void 0 } : {},
        sessionCount: g.sessions.length,
        expanded,
        containsCurrent: g.key === currentGroup,
        sessions: expanded ? g.sessions.map((session) => sessionNode(session, descendants, pendingInteractions)) : []
      });
    }
    return groups;
  }
  function deriveFlat(list2, archivedSessionIds, pendingInteractions) {
    const archived = new Set(archivedSessionIds);
    const descendants = indexSubagentDescendants(list2.byId);
    const rows = [];
    for (const id of list2.ids) {
      const s = list2.byId[id];
      if (s === void 0 || !sessionVisible(s, list2.current, archived)) continue;
      rows.push(s);
    }
    rows.sort(byRecency);
    return rows.map((session) => sessionNode(session, descendants, pendingInteractions));
  }
  function deriveSearchResults(list2, workspaces, query, archivedSessionIds, pendingInteractions, content, limit) {
    const q = query.trim().toLowerCase();
    if (q === "") return {
      items: [],
      hasMore: false
    };
    const archived = new Set(archivedSessionIds);
    const descendants = indexSubagentDescendants(list2.byId);
    const workspaceBySession = /* @__PURE__ */ new Map();
    for (const workspace of workspaces) for (const sessionId of workspace.sessionIds) if (!workspaceBySession.has(sessionId)) workspaceBySession.set(sessionId, workspace.title);
    const labelOf = (summary) => workspaceBySession.get(summary.id) ?? workspaceLabel(summary.cwd);
    const contentBySession = /* @__PURE__ */ new Map();
    for (const item of content.items) if (!contentBySession.has(item.sessionId)) contentBySession.set(item.sessionId, item);
    const local = [];
    for (const id of list2.ids) {
      const summary = list2.byId[id];
      if (summary === void 0 || summary.blank || !sessionVisible(summary, list2.current, archived)) continue;
      if (sessionTitle(summary).toLowerCase().includes(q) || labelOf(summary).toLowerCase().includes(q)) local.push(summary);
    }
    local.sort(byRecency);
    const ordered = [];
    const included = /* @__PURE__ */ new Set();
    const include = (summary) => {
      if (included.has(summary.id)) return;
      included.add(summary.id);
      ordered.push(summary);
    };
    for (const summary of local) include(summary);
    for (const item of content.items) {
      const summary = list2.byId[item.sessionId];
      if (summary !== void 0 && !summary.blank && sessionVisible(summary, list2.current, archived)) include(summary);
    }
    return {
      items: ordered.slice(0, limit).map((summary) => {
        const match = contentBySession.get(summary.id);
        const pendingInteraction = visiblePendingKind(pendingInteractions.get(summary.id)?.kind);
        return {
          id: summary.id,
          title: sessionTitle(summary),
          workspace: labelOf(summary),
          running: summary.running,
          runningSubagentCount: descendants.get(summary.id)?.runningCount ?? 0,
          ...summary.__dshWorktreeManager === void 0 ? {} : { __dshWorktreeManager: summary.__dshWorktreeManager },
          ...pendingInteraction === void 0 ? {} : { pendingInteraction },
          completed: summary.completed === true,
          hasActiveSchedule: hasActiveSchedule(summary),
          ...match === void 0 ? {} : { snippet: match.snippet }
        };
      }),
      hasMore: content.hasMore || ordered.length > limit
    };
  }
  const css$2 = '.YDXeBa_projectRow,.YDXeBa_sessionRow{cursor:pointer;user-select:none;color:var(--dsw-alias-label-primary);border-radius:8px;align-items:center;gap:6px;padding:0 8px;display:flex}.YDXeBa_projectRow:hover,.YDXeBa_sessionRow:hover,.YDXeBa_sessionRow.YDXeBa_selected{background:var(--dsw-alias-interactive-bg-hover)}.YDXeBa_searchResultRow{box-sizing:border-box;cursor:pointer;text-align:left;width:100%;min-height:48px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:8px;flex-direction:column;align-items:stretch;padding:4px 8px;display:flex}.YDXeBa_searchResultRow:hover,.YDXeBa_searchResultRow.YDXeBa_selected{background:var(--dsw-alias-interactive-bg-hover)}.YDXeBa_searchResultHeading{align-items:center;min-width:0;display:flex}.YDXeBa_searchResultTitle{text-overflow:ellipsis;white-space:nowrap;flex:0 auto;min-width:0;margin-left:4px;font-size:14px;line-height:20px;overflow:hidden}.YDXeBa_searchResultMeta{align-items:center;gap:6px;min-width:0;margin-left:20px;display:flex}.YDXeBa_searchResultWorkspace,.YDXeBa_searchResultSnippet{text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:17px;overflow:hidden}.YDXeBa_searchResultWorkspace{max-width:40%;color:var(--dsw-alias-label-tertiary);flex:none}.YDXeBa_searchResultSnippet{min-width:0;color:var(--dsw-alias-label-secondary);flex:1}.YDXeBa_projectRow{box-sizing:border-box;align-items:center;height:34px}.YDXeBa_projectRow .YDXeBa_rowActions{height:20px}.YDXeBa_sessionRow{height:32px;animation:YDXeBa_row-in .15s var(--ds-ease-in-out);gap:0}.YDXeBa_sessionRow .YDXeBa_title{margin:0 6px 0 4px}.YDXeBa_flatSessionRowWithoutStatus .YDXeBa_title{margin-left:0}@keyframes YDXeBa_row-in{0%{opacity:0}}.YDXeBa_slot{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}.YDXeBa_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}.YDXeBa_folderActive{color:var(--dsw-alias-state-business-primary)}.YDXeBa_projectRow .YDXeBa_chevron{display:none}.YDXeBa_projectRow:hover .YDXeBa_chevron{display:inline-flex}.YDXeBa_projectRow:hover .YDXeBa_folder{display:none}.YDXeBa_arrow{transition:transform .15s var(--ds-ease-in-out)}.YDXeBa_arrowOpen{transform:rotate(90deg)}.YDXeBa_projectText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.YDXeBa_title{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:14px;line-height:20px;overflow:hidden}.YDXeBa_renameInput{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-button-elevated-fill);min-width:0;color:inherit;border-radius:4px;outline:none;padding:0 2px;font-size:14px;line-height:20px}.YDXeBa_sessionRow .YDXeBa_title{flex:1}.YDXeBa_meta{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;overflow:hidden}.YDXeBa_time{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;line-height:20px}.YDXeBa_scheduleIndicator{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;margin-right:6px;display:inline-flex}.YDXeBa_searchScheduleIndicator{margin-left:4px;margin-right:0}.YDXeBa_dot{flex:none}.YDXeBa_rowActions{flex:none;align-items:center;gap:12px;display:none}.YDXeBa_projectRow:hover .YDXeBa_rowActions,.YDXeBa_sessionRow:hover .YDXeBa_rowActions,.YDXeBa_projectRow.YDXeBa_menuOpen .YDXeBa_rowActions,.YDXeBa_sessionRow.YDXeBa_menuOpen .YDXeBa_rowActions{display:inline-flex}.YDXeBa_sessionRow:hover .YDXeBa_time,.YDXeBa_sessionRow.YDXeBa_menuOpen .YDXeBa_time{display:none}.YDXeBa_projectRow.YDXeBa_menuOpen,.YDXeBa_sessionRow.YDXeBa_menuOpen{background:var(--dsw-alias-interactive-bg-hover)}.YDXeBa_sessionRow.YDXeBa_dropBefore,.YDXeBa_sessionRow.YDXeBa_dropAfter{position:relative}.YDXeBa_sessionRow.YDXeBa_dropBefore:before,.YDXeBa_sessionRow.YDXeBa_dropAfter:after{content:"";z-index:1;background:linear-gradient(55deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 0 / 5px 7px no-repeat, linear-gradient(125deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 5px / 5px 7px no-repeat, linear-gradient(var(--dsw-alias-state-business-primary) 0 0) 4px 5px / calc(100% - 4px) 2px no-repeat;pointer-events:none;height:12px;position:absolute;left:0;right:4px}.YDXeBa_sessionRow.YDXeBa_dropBefore:before{top:-7px}.YDXeBa_sessionRow.YDXeBa_dropAfter:after{bottom:-7px}.YDXeBa_hoverContent{flex-direction:column;gap:8px;display:flex}.YDXeBa_hoverTitle{color:#fff;overflow-wrap:break-word;font-size:14px;line-height:20px}.YDXeBa_hoverPath{color:#cfd3d6;word-break:break-all;font-size:12px;line-height:16px}.YDXeBa_hoverTime{color:#cfd3d6;font-size:12px;line-height:16px}.YDXeBa_hoverStatus{color:#adb2b8;align-items:center;gap:8px;font-size:12px;line-height:20px;display:flex}.YDXeBa_iconButton{cursor:pointer;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:4px;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.YDXeBa_iconButton:hover{color:var(--dsw-alias-label-primary)}.YDXeBa_chevron{color:var(--dsw-alias-label-caption)}@media (prefers-reduced-motion:reduce){.YDXeBa_sessionRow,.YDXeBa_arrow{transition:none;animation:none}}';
  const tagId$2 = "@deepseek-ai/dsh-client-ui-workspace/Rows.module.css";
  if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
    const tag = document.createElement("style");
    tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-workspace";
    tag.dataset.pluginCss = tagId$2;
    tag.textContent = css$2;
    document.head.appendChild(tag);
  }
  var Rows_module_css_default = {
    "arrow": "YDXeBa_arrow",
    "arrowOpen": "YDXeBa_arrowOpen",
    "chevron": "YDXeBa_chevron",
    "dot": "YDXeBa_dot",
    "dropAfter": "YDXeBa_dropAfter",
    "dropBefore": "YDXeBa_dropBefore",
    "flatSessionRowWithoutStatus": "YDXeBa_flatSessionRowWithoutStatus",
    "folder": "YDXeBa_folder",
    "folderActive": "YDXeBa_folderActive",
    "hoverContent": "YDXeBa_hoverContent",
    "hoverPath": "YDXeBa_hoverPath",
    "hoverStatus": "YDXeBa_hoverStatus",
    "hoverTime": "YDXeBa_hoverTime",
    "hoverTitle": "YDXeBa_hoverTitle",
    "iconButton": "YDXeBa_iconButton",
    "menuOpen": "YDXeBa_menuOpen",
    "meta": "YDXeBa_meta",
    "projectRow": "YDXeBa_projectRow",
    "projectText": "YDXeBa_projectText",
    "renameInput": "YDXeBa_renameInput",
    "row-in": "YDXeBa_row-in",
    "rowActions": "YDXeBa_rowActions",
    "scheduleIndicator": "YDXeBa_scheduleIndicator",
    "searchResultHeading": "YDXeBa_searchResultHeading",
    "searchResultMeta": "YDXeBa_searchResultMeta",
    "searchResultRow": "YDXeBa_searchResultRow",
    "searchResultSnippet": "YDXeBa_searchResultSnippet",
    "searchResultTitle": "YDXeBa_searchResultTitle",
    "searchResultWorkspace": "YDXeBa_searchResultWorkspace",
    "searchScheduleIndicator": "YDXeBa_searchScheduleIndicator",
    "selected": "YDXeBa_selected",
    "sessionRow": "YDXeBa_sessionRow",
    "slot": "YDXeBa_slot",
    "time": "YDXeBa_time",
    "title": "YDXeBa_title",
    "visuallyHidden": "YDXeBa_visuallyHidden"
  };
  function displayTitle(node, t) {
    return node.blank ? t("session.new") : node.title;
  }
  function timeLabel(updatedAt, now, t) {
    const { unit, n } = (0, _deepseek_ai_dsh_client_ui_primitives.relativeTime)(updatedAt, now);
    return unit === "now" ? t("time.now") : t(`time.${unit}`, { n });
  }
  function hoverTimeLabel(updatedAt, now, t) {
    const { unit, n } = (0, _deepseek_ai_dsh_client_ui_primitives.relativeTime)(updatedAt, now);
    return unit === "now" ? t("time.now") : t("time.ago", { t: t(`time.${unit}`, { n }) });
  }
  function createdLabel(createdAt, t) {
    const d = new Date(createdAt);
    const pad2 = (v) => String(v).padStart(2, "0");
    return t("hover.created", { time: `${t("date.ymd", {
      y: d.getFullYear(),
      m: d.getMonth() + 1,
      d: d.getDate()
    })} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` });
  }
  function WorkspaceHoverContent({ label, cwd, createdAt, t }) {
    return (0, react_jsx_runtime.jsxs)("div", {
      className: Rows_module_css_default.hoverContent,
      children: [
        (0, react_jsx_runtime.jsx)("div", {
          className: Rows_module_css_default.hoverTitle,
          children: label
        }),
        (0, react_jsx_runtime.jsx)("div", {
          className: Rows_module_css_default.hoverPath,
          children: cwd
        }),
        (0, react_jsx_runtime.jsx)("div", {
          className: Rows_module_css_default.hoverTime,
          children: createdLabel(createdAt, t)
        })
      ]
    });
  }
  function rowHalf(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }
  function ProjectRowItem({ group, onToggle, onCreate, actions, drag, home, t }) {
    const row = group;
    const label = row.__dshWorktreeManagerVirtual === true || row.workspaceId !== void 0 ? row.label : t("group.ungrouped");
    const worktreeBranchDecoration = row.__dshWorktreeManagerBranch;
    const worktreeMerged = row.__dshWorktreeManagerMerged === true;
    const worktreeMergeLabel = row.__dshWorktreeManagerMergeLabel;
    const worktreeNested = row.__dshWorktreeManagerNested === true;
    const active = group.expanded && group.containsCurrent;
    const [menuOpen, setMenuOpen] = (0, react2.useState)(false);
    const workspaceMenuItems = [{
      id: "rename",
      label: t("rename"),
      icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
    }, {
      id: "delete",
      label: t("delete.workspace"),
      icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),
      danger: true
    }];
    const ownRow = (0, react_jsx_runtime.jsxs)("div", {
      className: clsx(Rows_module_css_default.projectRow, menuOpen && Rows_module_css_default.menuOpen),
      role: "treeitem",
      "aria-expanded": row.expanded,
      onClick: onToggle,
      draggable: drag !== void 0,
      onDragStart: drag === void 0 ? void 0 : (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", row.key);
        drag.start();
      },
      onDragEnd: drag?.end,
      children: [
        (0, react_jsx_runtime.jsx)("span", {
          className: clsx(Rows_module_css_default.slot, Rows_module_css_default.folder, active && Rows_module_css_default.folderActive),
          children: row.expanded ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, {}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, {})
        }),
        (0, react_jsx_runtime.jsx)("span", {
          className: clsx(Rows_module_css_default.slot, Rows_module_css_default.chevron),
          children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFill14, { className: clsx(Rows_module_css_default.arrow, row.expanded && Rows_module_css_default.arrowOpen) })
        }),
        worktreeNested && worktreeBranchDecoration !== void 0 ? (0, react_jsx_runtime.jsx)(ManagedWorktreeIdentity, { decoration: {
          branch: worktreeBranchDecoration,
          merged: worktreeMerged,
          mergeLabel: worktreeMergeLabel,
          ariaLabel: worktreeBranchDecoration
        } }) : (0, react_jsx_runtime.jsx)("span", {
          className: Rows_module_css_default.projectText,
          children: (0, react_jsx_runtime.jsx)("span", {
            className: Rows_module_css_default.title,
            children: label
          })
        }),
        worktreeBranchDecoration !== void 0 && !worktreeNested && (0, react_jsx_runtime.jsx)("span", {
          className: clsx("dsh-worktree-manager-sidebar-badge", worktreeMerged && "dsh-worktree-manager-merged"),
          "data-worktree-branch": worktreeBranchDecoration,
          "data-worktree-merged": worktreeMerged ? "true" : "false",
          title: worktreeMergeLabel !== void 0 ? worktreeMergeLabel : worktreeBranchDecoration,
          "aria-hidden": "true",
          children: worktreeBranchDecoration
        }),
        (0, react_jsx_runtime.jsxs)("span", {
          className: Rows_module_css_default.rowActions,
          children: [actions !== void 0 && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
            open: menuOpen,
            onClose: () => {
              setMenuOpen(false);
            },
            items: workspaceMenuItems,
            onSelect: (id) => {
              setMenuOpen(false);
              if (id !== "rename" && id !== "delete") return;
              if (id === "rename") actions.rename();
              else actions.delete();
            },
            portal: true,
            closeOnPointerLeave: true,
            anchor: (0, react_jsx_runtime.jsx)("button", {
              type: "button",
              className: Rows_module_css_default.iconButton,
              "aria-label": t("actions.workspace.aria", { name: label }),
              onClick: (e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              },
              children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutline16, {})
            })
          }), (0, react_jsx_runtime.jsx)("button", {
            type: "button",
            className: Rows_module_css_default.iconButton,
            "aria-label": t("actions.newSession.aria", { name: label }),
            onClick: (e) => {
              e.stopPropagation();
              onCreate();
            },
            children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {})
          })]
        })
      ]
    });
    if (row.createdAt === void 0) return ownRow;
    return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {
      anchor: ownRow,
      content: (0, react_jsx_runtime.jsx)(WorkspaceHoverContent, {
        label: row.label,
        cwd: row.cwd === void 0 ? void 0 : abbreviateHomePath(row.cwd, home),
        createdAt: row.createdAt,
        t
      }),
      disabled: menuOpen,
      copyText: row.cwd,
      copyLabel: t("copy"),
      copiedLabel: t("hover.copied")
    });
  }
  function assertNever(value) {
    throw new Error(`unknown pending interaction: ${String(value)}`);
  }
  function sessionStatuses(node, t) {
    const subagents = node.runningSubagentCount === 0 ? void 0 : {
      state: "ongoing",
      label: t(node.runningSubagentCount === 1 ? "status.subagentsRunning.one" : "status.subagentsRunning.other", { n: node.runningSubagentCount })
    };
    let pending;
    switch (node.pendingInteraction) {
      case "approval":
        pending = {
          state: "warning",
          label: t("status.waitingApproval")
        };
        break;
      case "plan-review":
        pending = {
          state: "warning",
          label: t("status.planReview")
        };
        break;
      case "question":
        pending = {
          state: "warning",
          label: t("status.waitingAnswer")
        };
        break;
      case void 0:
        break;
      /* v8 ignore next -- closed PendingInteractionStatus union */
      default:
        return assertNever(node.pendingInteraction);
    }
    if (pending !== void 0) return subagents === void 0 ? [pending] : [pending, subagents];
    if (node.running) {
      const primary = {
        state: "ongoing",
        label: t("status.running")
      };
      return subagents === void 0 ? [primary] : [primary, subagents];
    }
    if (subagents !== void 0) return [subagents];
    if (node.completed) return [{
      state: "done",
      label: t("status.completed")
    }];
    return [{
      state: "done",
      label: t("status.idle")
    }];
  }
  function SessionStatusDots({ statuses }) {
    return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: statuses[0].state }), statuses.map((status) => (0, react_jsx_runtime.jsx)("span", {
      className: Rows_module_css_default.visuallyHidden,
      children: status.label
    }, status.label))] });
  }
  function ActiveScheduleIndicator({ t, search = false }) {
    const label = t("schedule.active");
    return (0, react_jsx_runtime.jsx)("span", {
      className: clsx(Rows_module_css_default.scheduleIndicator, search && Rows_module_css_default.searchScheduleIndicator),
      role: "img",
      "aria-label": label,
      title: label,
      children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconAlarmClockOutline16, {})
    });
  }
  function managedWorktreeDecoration(node, t) {
    const value = node.__dshWorktreeManager;
    if (value === void 0 || typeof value.branch !== "string" || value.branch.length === 0) return void 0;
    return {
      branch: value.branch,
      ariaLabel: `${t("dshWorktreeManager.workspace")}, ${value.branch}, ${displayTitle(node, t)}`
    };
  }
  function ManagedWorktreeIdentity({ decoration }) {
    const merged = decoration.merged === true;
    const title = decoration.mergeLabel !== void 0 ? decoration.mergeLabel : decoration.branch;
    return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("span", {
      className: clsx("dsh-worktree-manager-sidebar-icon", merged && "dsh-worktree-manager-merged"),
      "data-worktree-branch": decoration.branch,
      "data-worktree-merged": merged ? "true" : "false",
      title,
      "aria-hidden": "true",
      children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {})
    }), (0, react_jsx_runtime.jsx)("span", {
      className: clsx("dsh-worktree-manager-sidebar-badge", merged && "dsh-worktree-manager-merged"),
      "data-worktree-branch": decoration.branch,
      "data-worktree-merged": merged ? "true" : "false",
      title,
      "aria-hidden": "true",
      children: decoration.branch
    })] });
  }
  function SessionHoverContent({ node, now, t }) {
    const statuses = sessionStatuses(node, t);
    const worktreeDecoration = managedWorktreeDecoration(node, t);
    return (0, react_jsx_runtime.jsxs)("div", {
      className: Rows_module_css_default.hoverContent,
      children: [
        (0, react_jsx_runtime.jsx)("div", {
          className: Rows_module_css_default.hoverTitle,
          children: displayTitle(node, t)
        }),
        worktreeDecoration !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
          className: Rows_module_css_default.hoverStatus,
          children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {}), (0, react_jsx_runtime.jsx)("span", { children: worktreeDecoration.branch })]
        }),
        !node.blank && (0, react_jsx_runtime.jsx)("div", {
          className: Rows_module_css_default.hoverTime,
          children: hoverTimeLabel(node.updatedAt, now, t)
        }),
        statuses.map((status) => (0, react_jsx_runtime.jsxs)("div", {
          className: Rows_module_css_default.hoverStatus,
          children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: status.state }), (0, react_jsx_runtime.jsx)("span", { children: status.label })]
        }, status.label))
      ]
    });
  }
  function SearchResultItem({ result, currentId, onOpen, t }) {
    const selected = result.id === currentId;
    const statuses = sessionStatuses(result, t);
    const primaryStatus = statuses[0];
    const worktreeDecoration = managedWorktreeDecoration(result, t);
    return (0, react_jsx_runtime.jsxs)("button", {
      type: "button",
      className: clsx(Rows_module_css_default.searchResultRow, selected && Rows_module_css_default.selected),
      ...worktreeDecoration === void 0 ? {} : { "aria-label": worktreeDecoration.ariaLabel, "data-managed-worktree": "true" },
      role: "treeitem",
      "aria-selected": selected,
      onClick: () => {
        onOpen(result.id);
      },
      children: [(0, react_jsx_runtime.jsxs)("span", {
        className: Rows_module_css_default.searchResultHeading,
        children: [
          (0, react_jsx_runtime.jsx)("span", {
            className: Rows_module_css_default.slot,
            children: (primaryStatus.state !== "done" || result.completed) && (0, react_jsx_runtime.jsx)(SessionStatusDots, { statuses })
          }),
          worktreeDecoration !== void 0 && (0, react_jsx_runtime.jsx)(ManagedWorktreeIdentity, { decoration: worktreeDecoration }),
          (0, react_jsx_runtime.jsx)("span", {
            className: Rows_module_css_default.searchResultTitle,
            children: result.title
          }),
          result.hasActiveSchedule && (0, react_jsx_runtime.jsx)(ActiveScheduleIndicator, {
            t,
            search: true
          })
        ]
      }), (0, react_jsx_runtime.jsxs)("span", {
        className: Rows_module_css_default.searchResultMeta,
        children: [(0, react_jsx_runtime.jsx)("span", {
          className: Rows_module_css_default.searchResultWorkspace,
          children: result.workspace || t("group.ungrouped")
        }), result.snippet !== void 0 && (0, react_jsx_runtime.jsx)("span", {
          className: Rows_module_css_default.searchResultSnippet,
          children: result.snippet
        })]
      })]
    });
  }
  function SessionNodeItem({ node, currentId, now, onOpen, onRename, onFork, onArchive, drag, flat = false, t }) {
    const row = node;
    const title = displayTitle(node, t);
    const selected = node.id === currentId;
    const statuses = sessionStatuses(node, t);
    const showStatus = statuses[0].state !== "done" || row.completed;
    const worktreeDecoration = managedWorktreeDecoration(row, t);
    const [menuOpen, setMenuOpen] = (0, react2.useState)(false);
    const sessionMenuItems = [
      {
        id: "rename",
        label: t("rename"),
        icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, {})
      },
      {
        id: "fork",
        label: t("menu.fork"),
        icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {})
      },
      {
        id: "archive",
        label: t("menu.archiveSession"),
        icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })
      }
    ];
    const visibleSessionMenuItems = worktreeDecoration === void 0 ? sessionMenuItems : sessionMenuItems.filter((item) => item.id !== "fork");
    return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {
      anchor: (0, react_jsx_runtime.jsxs)("div", {
        className: clsx(Rows_module_css_default.sessionRow, selected && Rows_module_css_default.selected, menuOpen && Rows_module_css_default.menuOpen, flat && !showStatus && Rows_module_css_default.flatSessionRowWithoutStatus, drag?.marker === "before" && Rows_module_css_default.dropBefore, drag?.marker === "after" && Rows_module_css_default.dropAfter),
        role: "treeitem",
        ...worktreeDecoration === void 0 ? {} : { "aria-label": worktreeDecoration.ariaLabel, "data-managed-worktree": "true" },
        "aria-selected": selected,
        onClick: () => {
          onOpen(node.id);
        },
        draggable: worktreeDecoration === void 0 && drag !== void 0,
        onDragStart: drag === void 0 ? void 0 : (e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", node.id);
          drag.start();
        },
        onDragEnd: drag?.end,
        onDragOver: drag === void 0 ? void 0 : (e) => {
          if (!drag.active) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          drag.hover(rowHalf(e));
        },
        onDrop: drag === void 0 ? void 0 : (e) => {
          if (!drag.active) return;
          e.preventDefault();
          drag.drop(rowHalf(e));
        },
        children: [
          (!flat || showStatus) && (0, react_jsx_runtime.jsx)("span", {
            className: Rows_module_css_default.slot,
            children: showStatus && (0, react_jsx_runtime.jsx)(SessionStatusDots, { statuses })
          }),
          (0, react_jsx_runtime.jsx)("span", {
            className: Rows_module_css_default.title,
            children: title
          }),
          row.hasActiveSchedule && (0, react_jsx_runtime.jsx)(ActiveScheduleIndicator, { t }),
          !row.blank && (0, react_jsx_runtime.jsx)("span", {
            className: Rows_module_css_default.time,
            children: timeLabel(row.updatedAt, now, t)
          }),
          !row.blank && (0, react_jsx_runtime.jsx)("span", {
            className: Rows_module_css_default.rowActions,
            children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
              open: menuOpen,
              onClose: () => {
                setMenuOpen(false);
              },
              items: visibleSessionMenuItems,
              onSelect: (id) => {
                setMenuOpen(false);
                if (id === "rename") onRename(node.id, row.title);
                if (id === "fork") onFork(node.id);
                if (id === "archive") onArchive(node.id);
              },
              portal: true,
              closeOnPointerLeave: true,
              anchor: (0, react_jsx_runtime.jsx)("button", {
                type: "button",
                className: Rows_module_css_default.iconButton,
                "aria-label": t("actions.session.aria", { name: title }),
                onClick: (e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                },
                children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutline16, {})
              })
            })
          })
        ]
      }),
      content: (0, react_jsx_runtime.jsx)(SessionHoverContent, {
        node,
        now,
        t
      }),
      disabled: menuOpen || drag?.active === true,
      copyText: row.blank ? void 0 : row.title,
      copyLabel: t("copy"),
      copiedLabel: t("hover.copied")
    });
  }
  const css$1 = "._G5b-a_modalAction{min-width:72px}._G5b-a_modalError,._G5b-a_menuStatus{margin-top:8px;font-size:12px;line-height:18px}._G5b-a_modalError{color:var(--dsw-alias-state-error-primary)}._G5b-a_menuStatus{color:var(--dsw-alias-label-secondary)}";
  const tagId$1 = "@deepseek-ai/dsh-client-ui-workspace/WorkspacePicker.module.css";
  if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
    const tag = document.createElement("style");
    tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-workspace";
    tag.dataset.pluginCss = tagId$1;
    tag.textContent = css$1;
    document.head.appendChild(tag);
  }
  var WorkspacePicker_module_css_default = {
    "menuStatus": "_G5b-a_menuStatus",
    "modalAction": "_G5b-a_modalAction",
    "modalError": "_G5b-a_modalError"
  };
  const ADD_WORKSPACE = "::add-workspace";
  function WorkspacePickFlow({ t, open, anchorRef, useWorkspaces, createWorkspace: createWorkspace2, useDirectoryFlow, renderDirectoryFlow, onPick, onClose, addOnly = false, side = "bottom", selectedId }) {
    const workspaceSnapshot = useWorkspaces((state) => state);
    const workspaces = workspaceSnapshot.items;
    const getAnchorRect = (0, react2.useCallback)(() => anchorRef?.current?.getBoundingClientRect() ?? null, [anchorRef]);
    const [errorOpen, setErrorOpen] = (0, react2.useState)(false);
    const [modalError, setModalError] = (0, react2.useState)(null);
    const [flowOpen, setFlowOpen] = (0, react2.useState)(false);
    const [pickingFolder, setPickingFolder] = (0, react2.useState)(false);
    const flowBusy = flowOpen || pickingFolder;
    const flowAvailable = useDirectoryFlow((occupied) => occupied);
    (0, react2.useEffect)(() => {
      if (flowOpen && !flowAvailable) setFlowOpen(false);
    }, [flowOpen, flowAvailable]);
    const addEntries = flowAvailable ? [{
      id: ADD_WORKSPACE,
      label: t("menu.addWorkspace"),
      icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 16 }),
      disabled: flowBusy
    }] : [];
    const pinAdd = !addOnly && workspaces.length > 0;
    const items = pinAdd ? workspaces.map((workspace) => ({
      id: workspace.workspaceId,
      label: workspace.title,
      icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, { size: 16 }),
      disabled: flowBusy
    })) : addEntries;
    const menuIsEmpty = items.length === 0;
    const closeModal = () => {
      setErrorOpen(false);
      setModalError(null);
    };
    const adoptDirectory = (path) => createWorkspace2({ path }).then((workspace) => {
      setFlowOpen(false);
      onPick(workspace.workspaceId);
    }).catch((reason) => {
      setModalError(reason instanceof Error ? reason.message : String(reason));
      setFlowOpen(false);
      setErrorOpen(true);
    });
    const openDirectoryFlow = (0, react2.useCallback)(() => {
      onClose();
      setErrorOpen(false);
      setModalError(null);
      setFlowOpen(true);
    }, [onClose]);
    const listSettled = addOnly || workspaceSnapshot.phase === "ready";
    const addIsTheOnlyEntry = !pinAdd && listSettled && addEntries.length === 1;
    (0, react2.useEffect)(() => {
      if (open && addIsTheOnlyEntry && !flowBusy) openDirectoryFlow();
    }, [
      open,
      addIsTheOnlyEntry,
      flowBusy,
      openDirectoryFlow
    ]);
    const flowOwner = {
      open: flowOpen,
      busy: pickingFolder,
      onPicked: (path) => {
        setPickingFolder(true);
        adoptDirectory(path).finally(() => {
          setPickingFolder(false);
        });
      },
      onCancel: () => {
        setFlowOpen(false);
      },
      onError: (message) => {
        setFlowOpen(false);
        setModalError(message);
        setErrorOpen(true);
      }
    };
    const handleSelect = (id) => {
      if (id === ADD_WORKSPACE) {
        openDirectoryFlow();
        return;
      }
      onPick(id);
    };
    return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
      (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
        open: open && !addIsTheOnlyEntry && !menuIsEmpty,
        anchor: null,
        items,
        ...pinAdd ? { footer: addEntries } : {},
        selectedId,
        onSelect: handleSelect,
        onClose,
        side,
        portal: true,
        getAnchorRect
      }),
      open && !addIsTheOnlyEntry && !menuIsEmpty && workspaceSnapshot.phase === "pending" && (0, react_jsx_runtime.jsx)("div", {
        className: WorkspacePicker_module_css_default.menuStatus,
        role: "status",
        children: t("picker.loading")
      }),
      renderDirectoryFlow(flowOwner),
      (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
        open: errorOpen,
        onClose: closeModal,
        closeLabel: t("close"),
        title: t("folderError.title"),
        footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
          variant: "outline",
          className: WorkspacePicker_module_css_default.modalAction,
          onClick: closeModal,
          children: t("cancel")
        }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
          variant: "primary",
          className: WorkspacePicker_module_css_default.modalAction,
          disabled: !flowAvailable,
          onClick: openDirectoryFlow,
          children: t("folderError.retry")
        })] }),
        children: (0, react_jsx_runtime.jsx)("div", {
          className: WorkspacePicker_module_css_default.modalError,
          role: "alert",
          children: modalError
        })
      })
    ] });
  }
  function WorkspacePicker({ open, anchorRef, useWorkspaces, selectedId, onPick, onClose, createWorkspace: createWorkspace2, useDirectoryFlow, renderSlot, t }) {
    return (0, react_jsx_runtime.jsx)(WorkspacePickFlow, {
      t,
      open,
      anchorRef,
      useWorkspaces,
      createWorkspace: createWorkspace2,
      useDirectoryFlow,
      renderDirectoryFlow: (owner) => renderSlot("conversation.hero.workspace.directoryFlow", owner),
      selectedId,
      onPick,
      onClose
    });
  }
  const css = '.bhn1Oq_root{--dsh-session-list-edge-inset:var(--dsh-sidebar-inline-padding);--dsh-session-list-scrollbar-width:8px;--dsh-session-list-scrollbar-offset:2px;box-sizing:border-box;min-height:0;padding-right:var(--dsh-session-list-edge-inset);flex-direction:column;flex:1;display:flex}.bhn1Oq_root.bhn1Oq_rail{padding-right:0}.bhn1Oq_iconButton{corner-shape:round;cursor:pointer;width:28px;height:28px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.bhn1Oq_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.bhn1Oq_sectionHeader{box-sizing:border-box;height:36px;color:var(--dsw-alias-label-tertiary);border-radius:12px;flex:none;justify-content:flex-end;align-items:center;gap:4px;margin-bottom:4px;padding-left:4px;display:flex;overflow:hidden}.bhn1Oq_root:not(.bhn1Oq_rail) .bhn1Oq_sectionHeader{margin-top:2px;margin-right:-4px}.bhn1Oq_sectionLabel{white-space:nowrap;opacity:1;visibility:visible;min-width:0;max-width:45%;transition:max-width .18s var(--ds-ease-in-out), margin-right .18s var(--ds-ease-in-out), opacity .12s var(--ds-ease-in-out), transform .18s var(--ds-ease-in-out), visibility 0s linear;flex:none;line-height:20px;overflow:hidden}.bhn1Oq_sectionLabelHidden{opacity:0;visibility:hidden;max-width:0;margin-right:-4px;transition-delay:0s,0s,0s,0s,.18s;transform:translate(-4px)}.bhn1Oq_searchSlot{box-sizing:border-box;min-width:0;max-width:28px;transition:max-width .18s var(--ds-ease-in-out), padding-left .18s var(--ds-ease-in-out);flex:1;align-items:center;margin-left:auto;padding-left:0;display:flex}.bhn1Oq_searchSlotExpanded{max-width:100%;padding-left:0}.bhn1Oq_headerActions{opacity:1;visibility:visible;max-width:60px;transition:max-width .18s var(--ds-ease-in-out), opacity .12s var(--ds-ease-in-out), transform .18s var(--ds-ease-in-out), visibility 0s linear;flex:none;align-items:center;gap:4px;display:flex;overflow:hidden}.bhn1Oq_headerActionsHidden{opacity:0;visibility:hidden;pointer-events:none;max-width:0;transition-delay:0s,0s,0s,.18s;transform:translate(4px)}.bhn1Oq_search{box-sizing:border-box;corner-shape:round;cursor:text;width:100%;height:28px;color:var(--dsw-alias-label-secondary);transition:width .18s var(--ds-ease-in-out), padding .18s var(--ds-ease-in-out), border-color .18s var(--ds-ease-in-out), background-color .18s var(--ds-ease-in-out);background:0 0;border:none;border-radius:50%;flex:none;align-items:center;gap:0;margin:0;padding:0;display:flex;overflow:hidden}.bhn1Oq_searchExpanded{border:.5px solid var(--dsw-alias-border-l4);width:calc(100% + 4px);height:30px;color:var(--dsw-alias-label-caption);background:0 0;border-radius:10px;margin-inline:-2px;padding:0 4px 0 0}.bhn1Oq_searchButton{corner-shape:round;cursor:pointer;width:28px;height:28px;color:inherit;background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.bhn1Oq_searchExpanded .bhn1Oq_searchButton{width:28px;height:30px}.bhn1Oq_searchButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.bhn1Oq_searchExpanded .bhn1Oq_searchButton:hover{background:0 0}.bhn1Oq_searchInput{opacity:0;pointer-events:none;width:0;min-width:0;color:var(--dsw-alias-label-primary);transition:opacity .12s var(--ds-ease-in-out);background:0 0;border:none;outline:none;flex:1;font-size:13px;line-height:18px}.bhn1Oq_searchExpanded .bhn1Oq_searchInput{opacity:1;pointer-events:auto;margin-left:-2px}.bhn1Oq_searchInput::placeholder{color:var(--dsw-alias-label-tertiary)}.bhn1Oq_clearButton{corner-shape:round;cursor:pointer;width:24px;height:24px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.bhn1Oq_clearButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.bhn1Oq_rail .bhn1Oq_sectionHeader{justify-content:flex-start;gap:0;margin-bottom:12px;padding-left:0}.bhn1Oq_rail .bhn1Oq_headerActions{max-width:none}.bhn1Oq_rail .bhn1Oq_iconButton{width:36px;height:36px;color:var(--dsw-alias-label-primary)}.bhn1Oq_rail .bhn1Oq_search{background:0 0;border-color:#0000;gap:0;width:36px;height:36px;margin:0 0 12px;padding:0}.bhn1Oq_rail .bhn1Oq_searchButton{width:36px;height:36px;color:var(--dsw-alias-label-primary)}.bhn1Oq_rail .bhn1Oq_searchButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.bhn1Oq_listArea{min-height:0;margin-left:-4px;margin-right:calc(-1 * var(--dsh-session-list-edge-inset));flex-direction:column;flex:1;padding-left:4px;display:flex;overflow:visible}.bhn1Oq_rail .bhn1Oq_listArea{margin-left:0;margin-right:0;padding-left:0}.bhn1Oq_treeBody{flex-direction:column;flex:1;min-height:0;display:flex;position:relative}.bhn1Oq_fade{left:0;right:var(--dsh-session-list-edge-inset);background:linear-gradient(to bottom, transparent, var(--dsw-specific-sidebar-fill));pointer-events:none;height:24px;position:absolute;bottom:0}.bhn1Oq_wide{animation:bhn1Oq_wide-in .2s var(--ds-ease-in-out)}@keyframes bhn1Oq_wide-in{0%{opacity:0}}.bhn1Oq_list{min-height:0;margin-left:-4px;margin-right:var(--dsh-session-list-scrollbar-offset);padding-left:4px;padding-right:calc(var(--dsh-session-list-edge-inset) - var(--dsh-session-list-scrollbar-width) - var(--dsh-session-list-scrollbar-offset));scrollbar-gutter:stable;flex:1;padding-bottom:16px;overflow-y:auto}.bhn1Oq_flatList>*+*,.bhn1Oq_searchTree>[role=treeitem]+[role=treeitem],.bhn1Oq_groupSection>*+*{margin-top:2px}.bhn1Oq_searchStatus,.bhn1Oq_searchWarning{color:var(--dsw-alias-label-tertiary);padding:10px 12px;font-size:12px;line-height:18px}.bhn1Oq_searchWarning{color:var(--dsw-alias-label-secondary)}.bhn1Oq_groupSection{position:relative}.bhn1Oq_groupSection+.bhn1Oq_groupSection{margin-top:4px}.bhn1Oq_listTopDropIndicator,.bhn1Oq_workspaceDropBefore:before,.bhn1Oq_workspaceDropAfter:after{content:"";z-index:1;background:linear-gradient(55deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 0 / 5px 7px no-repeat, linear-gradient(125deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 5px / 5px 7px no-repeat, linear-gradient(var(--dsw-alias-state-business-primary) 0 0) 4px 5px / calc(100% - 4px) 2px no-repeat;pointer-events:none;height:12px;position:absolute;left:0;right:0}.bhn1Oq_listTopDropIndicator{top:-8px;left:0;right:var(--dsh-session-list-edge-inset)}.bhn1Oq_listTopDropActive>.bhn1Oq_workspaceDropBefore:first-child:before{display:none}.bhn1Oq_workspaceDropBefore:before{top:-8px}.bhn1Oq_workspaceDropAfter:after{bottom:-8px}.bhn1Oq_sessionOverflowButton{cursor:pointer;text-align:left;width:100%;height:28px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:8px;padding:0 12px 0 28px;font-size:12px}.bhn1Oq_groupSection>.bhn1Oq_sessionOverflowButton{margin-top:0}.bhn1Oq_sessionOverflowButton:hover{color:var(--dsw-alias-label-secondary);background:0 0}.bhn1Oq_empty{color:var(--dsw-alias-label-tertiary);padding:16px 12px;font-size:13px}.bhn1Oq_renameInput{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);width:100%;height:44px;color:var(--dsw-alias-label-primary);background:0 0;border-radius:22px;outline:none;padding:7px 14px;font-size:14px;font-weight:400;line-height:22px}.bhn1Oq_renameInput:disabled{color:var(--dsw-alias-label-dimmed)}.bhn1Oq_renameError{color:var(--dsw-alias-state-error-primary);margin-top:8px;font-size:12px;line-height:18px}.bhn1Oq_deleteAction:not(:disabled){color:var(--dsw-alias-state-error-primary)}.bhn1Oq_deleteStatus{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}@media (prefers-reduced-motion:reduce){.bhn1Oq_wide{animation:none}.bhn1Oq_search,.bhn1Oq_sectionLabel,.bhn1Oq_searchSlot,.bhn1Oq_searchInput,.bhn1Oq_headerActions{transition:none}}';
  const tagId = "@deepseek-ai/dsh-client-ui-workspace/WorkspaceBrowser.module.css";
  if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
    const tag = document.createElement("style");
    tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-workspace";
    tag.dataset.pluginCss = tagId;
    tag.textContent = css;
    document.head.appendChild(tag);
  }
  var WorkspaceBrowser_module_css_default = {
    "clearButton": "bhn1Oq_clearButton",
    "deleteAction": "bhn1Oq_deleteAction",
    "deleteStatus": "bhn1Oq_deleteStatus",
    "empty": "bhn1Oq_empty",
    "fade": "bhn1Oq_fade",
    "flatList": "bhn1Oq_flatList",
    "groupSection": "bhn1Oq_groupSection",
    "headerActions": "bhn1Oq_headerActions",
    "headerActionsHidden": "bhn1Oq_headerActionsHidden",
    "iconButton": "bhn1Oq_iconButton",
    "list": "bhn1Oq_list",
    "listArea": "bhn1Oq_listArea",
    "listTopDropActive": "bhn1Oq_listTopDropActive",
    "listTopDropIndicator": "bhn1Oq_listTopDropIndicator",
    "rail": "bhn1Oq_rail",
    "renameError": "bhn1Oq_renameError",
    "renameInput": "bhn1Oq_renameInput",
    "root": "bhn1Oq_root",
    "search": "bhn1Oq_search",
    "searchButton": "bhn1Oq_searchButton",
    "searchExpanded": "bhn1Oq_searchExpanded",
    "searchInput": "bhn1Oq_searchInput",
    "searchSlot": "bhn1Oq_searchSlot",
    "searchSlotExpanded": "bhn1Oq_searchSlotExpanded",
    "searchStatus": "bhn1Oq_searchStatus",
    "searchTree": "bhn1Oq_searchTree",
    "searchWarning": "bhn1Oq_searchWarning",
    "sectionHeader": "bhn1Oq_sectionHeader",
    "sectionLabel": "bhn1Oq_sectionLabel",
    "sectionLabelHidden": "bhn1Oq_sectionLabelHidden",
    "sessionOverflowButton": "bhn1Oq_sessionOverflowButton",
    "treeBody": "bhn1Oq_treeBody",
    "wide": "bhn1Oq_wide",
    "wide-in": "bhn1Oq_wide-in",
    "workspaceDropAfter": "bhn1Oq_workspaceDropAfter",
    "workspaceDropBefore": "bhn1Oq_workspaceDropBefore"
  };
  const EXPAND_SLIDE_MS = 300;
  const SEARCH_DEBOUNCE_MS = 250;
  const SEARCH_QUERY_MAX_CODE_UNITS = 500;
  const COLLAPSED_SESSION_LIMIT = 5;
  function collapsedSessionRows(sessions) {
    let ordinaryCount = 0;
    const rows = sessions.filter((session) => {
      if (session.blank) return true;
      if (ordinaryCount >= COLLAPSED_SESSION_LIMIT) return false;
      ordinaryCount += 1;
      return true;
    });
    return {
      rows,
      hiddenCount: sessions.length - rows.length
    };
  }
  function sanitizeSearchQuery(value) {
    const withoutNul = value.replaceAll("\0", "");
    if (withoutNul.length <= SEARCH_QUERY_MAX_CODE_UNITS) return withoutNul;
    let end = SEARCH_QUERY_MAX_CODE_UNITS;
    const last = withoutNul.charCodeAt(end - 1);
    const next = withoutNul.charCodeAt(end);
    if (last >= 55296 && last <= 56319 && next >= 56320 && next <= 57343) end--;
    return withoutNul.slice(0, end);
  }
  function toggled(list2, key) {
    return list2.includes(key) ? list2.filter((k) => k !== key) : [...list2, key];
  }
  function useNativeDragAcceptance(active) {
    (0, react2.useEffect)(() => {
      if (!active) return;
      const acceptDrag = (event) => {
        event.preventDefault();
        if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
      };
      const acceptDrop = (event) => {
        event.preventDefault();
      };
      document.addEventListener("dragover", acceptDrag);
      document.addEventListener("drop", acceptDrop);
      return () => {
        document.removeEventListener("dragover", acceptDrag);
        document.removeEventListener("drop", acceptDrop);
      };
    }, [active]);
  }
  function reconciledSessionOrder(sessionIds, stored) {
    if (stored === void 0) return [...sessionIds];
    const byId = new Map(sessionIds.map((id) => [id, id]));
    const ordered = [];
    const included = /* @__PURE__ */ new Set();
    for (const key of stored) {
      const id = byId.get(key);
      if (id === void 0 || included.has(key)) continue;
      ordered.push(id);
      included.add(key);
    }
    for (const id of sessionIds) {
      if (included.has(id)) continue;
      ordered.push(id);
    }
    return ordered;
  }
  function compareSessionRecency(a, b, byId) {
    const aUpdatedAt = byId[a]?.updatedAt ?? Number.NEGATIVE_INFINITY;
    const bUpdatedAt = byId[b]?.updatedAt ?? Number.NEGATIVE_INFINITY;
    if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt - aUpdatedAt;
    return a < b ? -1 : 1;
  }
  function nextSessionOrderAccount({ sessionIds, previousOrder, previousUpdatedAt, list: list2, orderBy, sortByRecency }) {
    let order = reconciledSessionOrder(sessionIds, previousOrder);
    if (sortByRecency) order.sort((a, b) => compareSessionRecency(a, b, list2.byId));
    else if (orderBy === "updated") {
      const promoted = sessionIds.filter((id) => {
        const session = list2.byId[id];
        return session !== void 0 && (previousUpdatedAt[id] === void 0 || session.updatedAt > previousUpdatedAt[id]);
      }).sort((a, b) => compareSessionRecency(a, b, list2.byId));
      if (promoted.length > 0) {
        const promotedIds = new Set(promoted);
        order = [...promoted, ...order.filter((id) => !promotedIds.has(id))];
      }
    }
    const updatedAt = {};
    for (const id of sessionIds) {
      const session = list2.byId[id];
      if (session !== void 0) updatedAt[id] = session.updatedAt;
    }
    const orderChanged = previousOrder === void 0 || order.length !== previousOrder.length || order.some((id, index) => id !== previousOrder[index]);
    const timestampsChanged = Object.keys(updatedAt).length !== Object.keys(previousUpdatedAt).length || Object.entries(updatedAt).some(([id, timestamp]) => previousUpdatedAt[id] !== timestamp);
    return {
      order,
      updatedAt,
      changed: orderChanged || timestampsChanged
    };
  }
  function ViewOptionsMenu({ groupBy, orderBy, onGroupPick, onOrderPick, t }) {
    const [open, setOpen] = (0, react2.useState)(false);
    return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
      open,
      onClose: () => {
        setOpen(false);
      },
      items: [
        {
          type: "label",
          id: "group-by",
          text: t("groupBy.label")
        },
        {
          id: "workspace",
          label: t("groupBy.workspace")
        },
        {
          id: "flat",
          label: t("groupBy.flat")
        },
        {
          type: "separator",
          id: "order-by-separator"
        },
        {
          type: "label",
          id: "order-by",
          text: t("orderBy.label")
        },
        {
          id: "manual",
          label: t("orderBy.manual")
        },
        {
          id: "updated",
          label: t("orderBy.updated")
        }
      ],
      selectedIds: [groupBy, orderBy],
      onSelect: (id) => {
        if (id === "workspace" || id === "flat") onGroupPick(id);
        else if (id === "manual" || id === "updated") onOrderPick(id);
        setOpen(false);
      },
      align: "end",
      dense: true,
      portal: true,
      anchor: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
        label: t("viewOptions.label"),
        side: "bottom",
        delayMs: 500,
        children: (0, react_jsx_runtime.jsx)("button", {
          type: "button",
          className: clsx(WorkspaceBrowser_module_css_default.iconButton, WorkspaceBrowser_module_css_default.wide),
          "aria-label": t("viewOptions.label"),
          onClick: () => {
            setOpen((v) => !v);
          },
          children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPersonalizationOutline16, {})
        })
      })
    });
  }
  function workspaceGroupHalf(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }
  function SessionTree({ useSessions, useSessionPendingInteraction, startSession, open, forkSession, workspaces, archivedSessionIds, onRenameRequest, onDeleteRequest, onSessionRename, onSessionArchive, insertWorkspaceBefore, insertSessionBefore, orderBy, groupExpansion, setGroupExpanded, sessionOrderByAccount, sessionUpdatedAtByAccount, syncSessionOrderAccount, setSessionOrder, home, t }) {
    const list2 = useSessions((s) => s);
    const pendingInteractions = useSessionPendingInteraction((s) => s);
    const current = list2.current;
    const [expandedSessionGroups, setExpandedSessionGroups] = (0, react2.useState)([]);
    const [drag, setDrag] = (0, react2.useState)(null);
    const sessionDropCommitted = (0, react2.useRef)(false);
    const [workspaceDrag, setWorkspaceDrag] = (0, react2.useState)(null);
    const workspaceDropCommitted = (0, react2.useRef)(false);
    const previousOrderBy = (0, react2.useRef)(orderBy);
    useNativeDragAcceptance(drag !== null || workspaceDrag !== null);
    const currentGroup = current === void 0 ? void 0 : workspaces.find((w) => w.sessionIds.includes(current))?.workspaceId ?? "";
    (0, react2.useEffect)(() => {
      if (current === void 0 || currentGroup === void 0 || Object.hasOwn(groupExpansion, currentGroup)) return;
      setGroupExpanded(currentGroup, true);
      const parentKey = workspaces.find((w) => w.workspaceId === currentGroup)?.__dshWorktreeManagerParent;
      if (parentKey !== void 0 && !Object.hasOwn(groupExpansion, parentKey)) setGroupExpanded(parentKey, true);
    }, [
      current,
      currentGroup,
      setGroupExpanded,
      groupExpansion
    ]);
    const expandedGroups = (0, react2.useMemo)(() => Object.entries(groupExpansion).filter(([, expanded]) => expanded).map(([key]) => key), [groupExpansion]);
    const ungroupedSessionIds = (0, react2.useMemo)(() => {
      const accounted = new Set(workspaces.flatMap((workspace) => workspace.sessionIds));
      return list2.ids.filter((id) => list2.byId[id] !== void 0 && !accounted.has(id));
    }, [list2, workspaces]);
    (0, react2.useEffect)(() => {
      if (list2.phase !== "ready") return;
      const switchedToUpdated = previousOrderBy.current !== "updated" && orderBy === "updated";
      previousOrderBy.current = orderBy;
      const accounts = [...workspaces.map((workspace) => ({
        key: workspace.workspaceId,
        sessionIds: workspace.sessionIds.filter((id) => list2.byId[id] !== void 0)
      })), {
        key: "",
        sessionIds: ungroupedSessionIds
      }];
      for (const { key, sessionIds } of accounts) {
        const previousOrder = sessionOrderByAccount[key];
        const next = nextSessionOrderAccount({
          sessionIds,
          previousOrder,
          previousUpdatedAt: sessionUpdatedAtByAccount[key] ?? {},
          list: list2,
          orderBy,
          sortByRecency: orderBy === "updated" && (previousOrder === void 0 || switchedToUpdated)
        });
        if (next.changed) syncSessionOrderAccount(key, next.order.map((id) => id), next.updatedAt);
      }
    }, [
      list2,
      orderBy,
      sessionOrderByAccount,
      sessionUpdatedAtByAccount,
      syncSessionOrderAccount,
      ungroupedSessionIds,
      workspaces
    ]);
    const orderedWorkspaces = (0, react2.useMemo)(() => {
      return workspaces.map((workspace) => {
        const stored = sessionOrderByAccount[workspace.workspaceId];
        const sessionIds = reconciledSessionOrder(workspace.sessionIds, stored);
        return {
          ...workspace,
          sessionIds
        };
      });
    }, [sessionOrderByAccount, workspaces]);
    const orderedUngroupedSessionIds = (0, react2.useMemo)(() => reconciledSessionOrder(ungroupedSessionIds, sessionOrderByAccount[""]), [sessionOrderByAccount, ungroupedSessionIds]);
    const groups = (0, react2.useMemo)(() => deriveGroups(list2, orderedWorkspaces, archivedSessionIds, pendingInteractions, {
      expandedGroups,
      ...sessionOrderByAccount[""] === void 0 ? {} : { ungroupedOrder: sessionOrderByAccount[""] }
    }), [
      list2,
      orderedWorkspaces,
      archivedSessionIds,
      pendingInteractions,
      expandedGroups,
      sessionOrderByAccount
    ]);
    const now = Date.now();
    const commitSessionDrag = (activeDrag, over) => {
      if (sessionDropCommitted.current) return;
      sessionDropCommitted.current = true;
      setDrag(null);
      const group = groups.find((candidate) => candidate.key === activeDrag.accountKey);
      if (group === void 0) return;
      const sessionsExpanded = expandedSessionGroups.includes(group.key);
      const renderedSessions = sessionsExpanded ? group.sessions : collapsedSessionRows(group.sessions).rows;
      const targetIndex = renderedSessions.findIndex((session) => session.id === over.id);
      if (targetIndex === -1) return;
      const sourceIndex = renderedSessions.findIndex((session) => session.id === activeDrag.sessionId);
      if (over.id === activeDrag.sessionId) return;
      const withoutSource = renderedSessions.filter((session) => session.id !== activeDrag.sessionId);
      const targetWithoutSourceIndex = withoutSource.findIndex((session) => session.id === over.id);
      if (targetWithoutSourceIndex === -1) return;
      const visibleInsertAt = over.half === "before" ? targetWithoutSourceIndex : targetWithoutSourceIndex + 1;
      if (sourceIndex !== -1 && visibleInsertAt === sourceIndex) return;
      const accountSessionIds = activeDrag.accountKey === "" ? orderedUngroupedSessionIds : orderedWorkspaces.find((workspace) => workspace.workspaceId === activeDrag.accountKey)?.sessionIds;
      if (accountSessionIds === void 0) return;
      const nextOrder = accountSessionIds.filter((id) => id !== activeDrag.sessionId);
      let anchor;
      if (sessionsExpanded) anchor = over.half === "before" ? over.id : renderedSessions[targetIndex + 1]?.id;
      else {
        const previousVisible = withoutSource[visibleInsertAt - 1]?.id;
        if (previousVisible === void 0) anchor = nextOrder[0];
        else {
          const previousIndex = nextOrder.indexOf(previousVisible);
          if (previousIndex === -1) return;
          anchor = nextOrder[previousIndex + 1];
        }
      }
      const insertAt = anchor === void 0 ? nextOrder.length : nextOrder.indexOf(anchor);
      nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, activeDrag.sessionId);
      if (!sessionsExpanded && sourceIndex !== -1) {
        const nodes = new Map(group.sessions.map((node) => [node.id, node]));
        if (!collapsedSessionRows(nextOrder.flatMap((id) => {
          const node = nodes.get(id);
          return node === void 0 ? [] : [node];
        })).rows.some((node) => node.id === activeDrag.sessionId)) return;
      }
      setSessionOrder(activeDrag.accountKey, nextOrder.map((id) => id));
      if (orderBy === "updated" || activeDrag.accountKey === "") return;
      insertSessionBefore(activeDrag.accountKey, activeDrag.sessionId, anchor).catch((reason) => {
        console.warn("session reorder rejected:", reason);
      });
    };
    const commitWorkspaceDrag = (activeDrag, over) => {
      if (workspaceDropCommitted.current) return;
      workspaceDropCommitted.current = true;
      setWorkspaceDrag(null);
      const rowIndex = workspaces.findIndex((workspace) => workspace.workspaceId === over.id);
      if (rowIndex === -1) return;
      const anchor = over.half === "before" ? over.id : workspaces[rowIndex + 1]?.workspaceId;
      if (anchor === activeDrag.workspaceId) return;
      const sourceIndex = workspaces.findIndex((workspace) => workspace.workspaceId === activeDrag.workspaceId);
      const anchorIndex = anchor === void 0 ? workspaces.length : workspaces.findIndex((workspace) => workspace.workspaceId === anchor);
      if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return;
      insertWorkspaceBefore(activeDrag.workspaceId, anchor).catch((reason) => {
        console.warn("workspace reorder rejected:", reason);
      });
    };
    const workspaceDropAtListStart = groups[0]?.workspaceId !== void 0 && workspaceDrag?.over?.id === groups[0].workspaceId && workspaceDrag.over.half === "before";
    return (0, react_jsx_runtime.jsxs)("div", {
      className: clsx(WorkspaceBrowser_module_css_default.treeBody, WorkspaceBrowser_module_css_default.wide),
      children: [
        workspaceDropAtListStart && (0, react_jsx_runtime.jsx)("span", {
          className: WorkspaceBrowser_module_css_default.listTopDropIndicator,
          "aria-hidden": "true"
        }),
        (0, react_jsx_runtime.jsxs)("div", {
          className: clsx(WorkspaceBrowser_module_css_default.list, workspaceDropAtListStart && WorkspaceBrowser_module_css_default.listTopDropActive),
          role: "tree",
          "aria-label": t("section.sessions"),
          children: [groups.length === 0 && (0, react_jsx_runtime.jsx)("div", {
            className: WorkspaceBrowser_module_css_default.empty,
            children: t("empty.none")
          }), groups.filter((group) => group.__dshWorktreeManagerParent === void 0 || expandedGroups.includes(group.__dshWorktreeManagerParent)).map((group) => {
            const workspaceId = group.workspaceId;
            const collapsed = collapsedSessionRows(group.sessions);
            const sessionsExpanded = expandedSessionGroups.includes(group.key);
            const workspaceMarker = workspaceId !== void 0 && workspaceDrag?.over?.id === workspaceId ? workspaceDrag.over.half : null;
            const workspaceDragProps = workspaceId === void 0 ? void 0 : {
              start: () => {
                workspaceDropCommitted.current = false;
                setWorkspaceDrag({
                  workspaceId,
                  over: null
                });
              },
              end: () => {
                if (workspaceDrag?.over !== null && workspaceDrag?.over !== void 0) commitWorkspaceDrag(workspaceDrag, workspaceDrag.over);
                else setWorkspaceDrag(null);
                workspaceDropCommitted.current = false;
              }
            };
            const hoverWorkspace = workspaceId === void 0 ? void 0 : (half) => {
              setWorkspaceDrag((active) => active === null ? active : {
                ...active,
                over: {
                  id: workspaceId,
                  half
                }
              });
            };
            const dropWorkspace = workspaceId === void 0 ? void 0 : (half) => {
              if (workspaceDrag === null) return;
              commitWorkspaceDrag(workspaceDrag, {
                id: workspaceId,
                half
              });
            };
            return (0, react_jsx_runtime.jsxs)("div", {
              className: clsx(WorkspaceBrowser_module_css_default.groupSection, workspaceMarker === "before" && WorkspaceBrowser_module_css_default.workspaceDropBefore, workspaceMarker === "after" && WorkspaceBrowser_module_css_default.workspaceDropAfter, group.__dshWorktreeManagerNested === true && "dsh-worktree-manager-nested"),
              onDragOver: workspaceDrag === null || hoverWorkspace === void 0 ? void 0 : (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                hoverWorkspace(workspaceGroupHalf(e));
              },
              onDrop: workspaceDrag === null || dropWorkspace === void 0 ? void 0 : (e) => {
                e.preventDefault();
                dropWorkspace(workspaceGroupHalf(e));
              },
              children: [
                (0, react_jsx_runtime.jsx)(ProjectRowItem, {
                  group,
                  home,
                  t,
                  onToggle: () => {
                    if (group.expanded) setExpandedSessionGroups((keys) => keys.filter((key) => key !== group.key));
                    setGroupExpanded(group.key, !group.expanded);
                  },
                  onCreate: () => {
                    const createTarget = group.__dshWorktreeManagerHost ?? group.workspaceId;
                    if (createTarget !== void 0) {
                      setGroupExpanded(group.key, true);
                      startSession(createTarget);
                    }
                  },
                  drag: workspaceDragProps,
                  actions: group.workspaceId === void 0 ? void 0 : {
                    rename: () => {
                      if (group.workspaceId !== void 0) onRenameRequest(group.workspaceId, group.label);
                    },
                    delete: () => {
                      if (group.workspaceId !== void 0) onDeleteRequest(group.workspaceId, group.label);
                    }
                  }
                }),
                (sessionsExpanded ? group.sessions : collapsed.rows).map((node) => {
                  const sameGroupDrag = drag !== null && drag.accountKey === group.key;
                  return (0, react_jsx_runtime.jsx)(SessionNodeItem, {
                    node,
                    currentId: current,
                    now,
                    onOpen: open,
                    onRename: onSessionRename,
                    onFork: forkSession,
                    onArchive: onSessionArchive,
                    drag: {
                      start: () => {
                        sessionDropCommitted.current = false;
                        setDrag({
                          accountKey: group.key,
                          sessionId: node.id,
                          over: null
                        });
                      },
                      active: sameGroupDrag,
                      marker: sameGroupDrag && drag.over?.id === node.id ? drag.over.half : null,
                      hover: (half) => {
                        setDrag((d) => d === null ? d : {
                          ...d,
                          over: {
                            id: node.id,
                            half
                          }
                        });
                      },
                      drop: (half) => {
                        if (drag === null) return;
                        commitSessionDrag(drag, {
                          id: node.id,
                          half
                        });
                      },
                      end: () => {
                        if (drag?.over !== null && drag?.over !== void 0) commitSessionDrag(drag, drag.over);
                        else setDrag(null);
                        sessionDropCommitted.current = false;
                      }
                    },
                    t
                  }, node.id);
                }),
                collapsed.hiddenCount > 0 && (0, react_jsx_runtime.jsx)("button", {
                  type: "button",
                  className: WorkspaceBrowser_module_css_default.sessionOverflowButton,
                  "aria-expanded": sessionsExpanded,
                  onClick: () => {
                    setExpandedSessionGroups((keys) => toggled(keys, group.key));
                  },
                  children: sessionsExpanded ? t("sessions.collapse") : t("sessions.expand", { n: collapsed.hiddenCount })
                })
              ]
            }, group.key);
          })]
        }),
        (0, react_jsx_runtime.jsx)("span", { className: WorkspaceBrowser_module_css_default.fade })
      ]
    });
  }
  function FlatList({ useSessions, useSessionPendingInteraction, open, forkSession, onSessionRename, onSessionArchive, archivedSessionIds, orderBy, sessionOrderByAccount, sessionUpdatedAtByAccount, syncSessionOrderAccount, setSessionOrder, t }) {
    const list2 = useSessions((s) => s);
    const pendingInteractions = useSessionPendingInteraction((s) => s);
    const baseRows = (0, react2.useMemo)(() => deriveFlat(list2, archivedSessionIds, pendingInteractions), [
      list2,
      archivedSessionIds,
      pendingInteractions
    ]);
    const sessionIds = (0, react2.useMemo)(() => baseRows.map((row) => row.id), [baseRows]);
    const previousOrderBy = (0, react2.useRef)(orderBy);
    (0, react2.useEffect)(() => {
      if (list2.phase !== "ready") return;
      const previousOrder = sessionOrderByAccount[FLAT_SESSION_ORDER_KEY];
      const previousUpdatedAt = sessionUpdatedAtByAccount["__flat_session_order__"] ?? {};
      const switchedToUpdated = previousOrderBy.current !== "updated" && orderBy === "updated";
      previousOrderBy.current = orderBy;
      const next = nextSessionOrderAccount({
        sessionIds,
        previousOrder,
        previousUpdatedAt,
        list: list2,
        orderBy,
        sortByRecency: orderBy === "updated" && (previousOrder === void 0 || switchedToUpdated)
      });
      if (next.changed) syncSessionOrderAccount(FLAT_SESSION_ORDER_KEY, next.order.map((id) => id), next.updatedAt);
    }, [
      list2,
      orderBy,
      sessionOrderByAccount,
      sessionUpdatedAtByAccount,
      sessionIds,
      syncSessionOrderAccount
    ]);
    const rows = (0, react2.useMemo)(() => {
      const byId = new Map(baseRows.map((row) => [row.id, row]));
      return reconciledSessionOrder(sessionIds, sessionOrderByAccount[FLAT_SESSION_ORDER_KEY]).flatMap((id) => {
        const row = byId.get(id);
        return row === void 0 ? [] : [row];
      });
    }, [
      baseRows,
      sessionOrderByAccount,
      sessionIds
    ]);
    const [drag, setDrag] = (0, react2.useState)(null);
    const dropCommitted = (0, react2.useRef)(false);
    useNativeDragAcceptance(drag !== null);
    const commitDrag = (activeDrag, over) => {
      if (dropCommitted.current) return;
      dropCommitted.current = true;
      setDrag(null);
      const targetIndex = rows.findIndex((row) => row.id === over.id);
      if (targetIndex === -1) return;
      const anchor = over.half === "before" ? over.id : rows[targetIndex + 1]?.id;
      if (anchor === activeDrag.sessionId) return;
      const sourceIndex = rows.findIndex((row) => row.id === activeDrag.sessionId);
      const anchorIndex = anchor === void 0 ? rows.length : rows.findIndex((row) => row.id === anchor);
      if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return;
      const nextOrder = rows.map((row) => row.id).filter((id) => id !== activeDrag.sessionId);
      const insertAt = anchor === void 0 ? nextOrder.length : nextOrder.indexOf(anchor);
      nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, activeDrag.sessionId);
      setSessionOrder(FLAT_SESSION_ORDER_KEY, nextOrder.map((id) => id));
    };
    const now = Date.now();
    return (0, react_jsx_runtime.jsxs)("div", {
      className: clsx(WorkspaceBrowser_module_css_default.treeBody, WorkspaceBrowser_module_css_default.wide),
      children: [(0, react_jsx_runtime.jsxs)("div", {
        className: clsx(WorkspaceBrowser_module_css_default.list, WorkspaceBrowser_module_css_default.flatList),
        role: "tree",
        "aria-label": t("section.sessions"),
        children: [rows.length === 0 && (0, react_jsx_runtime.jsx)("div", {
          className: WorkspaceBrowser_module_css_default.empty,
          children: t("empty.none")
        }), rows.map((node) => {
          const active = drag !== null;
          return (0, react_jsx_runtime.jsx)(SessionNodeItem, {
            node,
            currentId: list2.current,
            now,
            onOpen: open,
            onRename: onSessionRename,
            onFork: forkSession,
            onArchive: onSessionArchive,
            flat: true,
            drag: {
              start: () => {
                dropCommitted.current = false;
                setDrag({
                  accountKey: FLAT_SESSION_ORDER_KEY,
                  sessionId: node.id,
                  over: null
                });
              },
              active,
              marker: active && drag.over?.id === node.id ? drag.over.half : null,
              hover: (half) => {
                setDrag((current) => current === null ? current : {
                  ...current,
                  over: {
                    id: node.id,
                    half
                  }
                });
              },
              drop: (half) => {
                if (drag !== null) commitDrag(drag, {
                  id: node.id,
                  half
                });
              },
              end: () => {
                if (drag?.over !== null && drag?.over !== void 0) commitDrag(drag, drag.over);
                else setDrag(null);
                dropCommitted.current = false;
              }
            },
            t
          }, node.id);
        })]
      }), (0, react_jsx_runtime.jsx)("span", { className: WorkspaceBrowser_module_css_default.fade })]
    });
  }
  function SearchResults({ useSessions, useSessionPendingInteraction, open, workspaces, archivedSessionIds, query, remote, resultLimit, t }) {
    const list2 = useSessions((s) => s);
    const pendingInteractions = useSessionPendingInteraction((s) => s);
    const currentRemote = remote.query === query ? remote : {
      query,
      status: "loading",
      items: [],
      hasMore: false
    };
    const results = (0, react2.useMemo)(() => deriveSearchResults(list2, workspaces, query, archivedSessionIds, pendingInteractions, currentRemote, resultLimit), [
      list2,
      workspaces,
      query,
      archivedSessionIds,
      pendingInteractions,
      currentRemote,
      resultLimit
    ]);
    const pending = currentRemote.status === "loading";
    const failed = currentRemote.status === "error";
    return (0, react_jsx_runtime.jsxs)("div", {
      className: clsx(WorkspaceBrowser_module_css_default.treeBody, WorkspaceBrowser_module_css_default.wide),
      children: [(0, react_jsx_runtime.jsxs)("div", {
        className: WorkspaceBrowser_module_css_default.list,
        children: [
          (0, react_jsx_runtime.jsx)("div", {
            className: WorkspaceBrowser_module_css_default.searchTree,
            role: "tree",
            "aria-label": t("search.results.aria"),
            children: results.items.map((result) => (0, react_jsx_runtime.jsx)(SearchResultItem, {
              result,
              currentId: list2.current,
              onOpen: open,
              t
            }, result.id))
          }),
          pending && (0, react_jsx_runtime.jsx)("div", {
            className: WorkspaceBrowser_module_css_default.searchStatus,
            role: "status",
            children: t("search.pending")
          }),
          failed && (0, react_jsx_runtime.jsx)("div", {
            className: WorkspaceBrowser_module_css_default.searchWarning,
            role: "status",
            children: t("search.unavailable")
          }),
          !pending && results.items.length === 0 && (0, react_jsx_runtime.jsx)("div", {
            className: WorkspaceBrowser_module_css_default.empty,
            children: t("search.noMatches")
          }),
          results.hasMore && (0, react_jsx_runtime.jsx)("div", {
            className: WorkspaceBrowser_module_css_default.searchStatus,
            children: t("search.hasMore", { n: resultLimit })
          })
        ]
      }), (0, react_jsx_runtime.jsx)("span", { className: WorkspaceBrowser_module_css_default.fade })]
    });
  }
  function WorkspaceBrowser({ wide, expandSidebar, useSessions, useSessionPendingInteraction, useWorkspaces, useStore, actions, startSession, open, renameSession, forkSession, renameWorkspace, deleteWorkspace, insertWorkspaceBefore, archiveSession, insertSessionBefore, createWorkspace: createWorkspace2, searchSessions, searchResultLimit, useDirectoryFlow, useHostInfo, renderSlot, t }) {
    const home = useHostInfo((info) => info.home);
    const workspaces = useWorkspaces((state) => state.items);
    const workspacePhase = useWorkspaces((state) => state.phase);
    const archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds);
    const directoryFlowAvailable = useDirectoryFlow((occupied) => occupied);
    const groupBy = useStore((s) => s.groupBy);
    const orderBy = useStore((s) => s.orderBy);
    const groupExpansion = useStore((s) => s.groupExpansion);
    const sessionOrderByAccount = useStore((s) => s.sessionOrderByAccount);
    const sessionUpdatedAtByAccount = useStore((s) => s.sessionUpdatedAtByAccount);
    const currentBlankSessionId = useSessions((state) => {
      const current = state.current;
      return current !== void 0 && state.byId[current]?.blank === true ? current : void 0;
    });
    const currentBlankAccount = currentBlankSessionId === void 0 ? void 0 : workspaces.find((workspace) => workspace.sessionIds.includes(currentBlankSessionId))?.workspaceId ?? "";
    const promotedBlank = (0, react2.useRef)(void 0);
    (0, react2.useEffect)(() => {
      if (currentBlankSessionId === void 0 || currentBlankAccount === void 0) {
        promotedBlank.current = void 0;
        return;
      }
      const promoted = promotedBlank.current;
      if (promoted !== void 0 && promoted.sessionId === currentBlankSessionId && promoted.accountKey === currentBlankAccount) return;
      promotedBlank.current = {
        sessionId: currentBlankSessionId,
        accountKey: currentBlankAccount
      };
      for (const accountKey of /* @__PURE__ */ new Set([currentBlankAccount, FLAT_SESSION_ORDER_KEY])) {
        const previous = sessionOrderByAccount[accountKey] ?? [];
        actions.setSessionOrder(accountKey, [currentBlankSessionId, ...previous.filter((id) => id !== currentBlankSessionId)]);
      }
    }, [
      actions.setSessionOrder,
      currentBlankAccount,
      currentBlankSessionId,
      sessionOrderByAccount
    ]);
    (0, react2.useEffect)(() => {
      if (workspacePhase !== "ready") return;
      actions.retainAccountKeys([
        "",
        FLAT_SESSION_ORDER_KEY,
        ...workspaces.map((workspace) => workspace.workspaceId)
      ]);
    }, [
      actions.retainAccountKeys,
      workspacePhase,
      workspaces
    ]);
    const [query, setQuery] = (0, react2.useState)("");
    const [searchExpanded, setSearchExpanded] = (0, react2.useState)(false);
    const normalizedQuery = sanitizeSearchQuery(query).trim();
    const [remoteSearch, setRemoteSearch] = (0, react2.useState)({
      query: "",
      status: "idle",
      items: [],
      hasMore: false
    });
    const searchRoot = (0, react2.useRef)(null);
    const searchInput = (0, react2.useRef)(null);
    const [wsPickerOpen, setWsPickerOpen] = (0, react2.useState)(false);
    const wsPlusRef = (0, react2.useRef)(null);
    const composingRef = (0, react2.useRef)(false);
    const [searchOnExpand, setSearchOnExpand] = (0, react2.useState)(false);
    (0, react2.useEffect)(() => {
      if (wide && searchOnExpand) {
        const timer = window.setTimeout(() => {
          searchInput.current?.focus({ preventScroll: true });
          setSearchOnExpand(false);
        }, EXPAND_SLIDE_MS);
        return () => {
          window.clearTimeout(timer);
        };
      }
    }, [wide, searchOnExpand]);
    (0, react2.useEffect)(() => {
      if (!wide || !searchExpanded || searchOnExpand) return;
      searchInput.current?.focus({ preventScroll: true });
    }, [
      wide,
      searchExpanded,
      searchOnExpand
    ]);
    (0, react2.useEffect)(() => {
      if (!wide || !searchExpanded || searchOnExpand) return;
      const onClick = (event) => {
        if (!(event.target instanceof Node) || searchRoot.current?.contains(event.target) === true) return;
        searchInput.current?.blur();
        if (normalizedQuery !== "") return;
        setSearchExpanded(false);
      };
      document.addEventListener("click", onClick);
      return () => {
        document.removeEventListener("click", onClick);
      };
    }, [
      normalizedQuery,
      wide,
      searchExpanded,
      searchOnExpand
    ]);
    (0, react2.useEffect)(() => {
      if (normalizedQuery === "") {
        setRemoteSearch({
          query: "",
          status: "idle",
          items: [],
          hasMore: false
        });
        return;
      }
      const controller = new AbortController();
      setRemoteSearch({
        query: normalizedQuery,
        status: "loading",
        items: [],
        hasMore: false
      });
      const timer = window.setTimeout(() => {
        searchSessions(normalizedQuery, controller.signal).then((result) => {
          if (controller.signal.aborted) return;
          setRemoteSearch({
            query: normalizedQuery,
            status: "ready",
            items: result.items,
            hasMore: result.hasMore
          });
        }).catch(() => {
          if (controller.signal.aborted) return;
          setRemoteSearch({
            query: normalizedQuery,
            status: "error",
            items: [],
            hasMore: false
          });
        });
      }, SEARCH_DEBOUNCE_MS);
      return () => {
        window.clearTimeout(timer);
        controller.abort();
      };
    }, [normalizedQuery, searchSessions]);
    const [renameTarget, setRenameTarget] = (0, react2.useState)(null);
    const [renameDraft, setRenameDraft] = (0, react2.useState)("");
    const [renaming, setRenaming] = (0, react2.useState)(false);
    const [renameError, setRenameError] = (0, react2.useState)(null);
    const renameTrimmed = renameDraft.trim();
    const renameDuplicate = renameTarget !== null && renameTrimmed !== "" && renameTrimmed !== renameTarget.currentTitle && workspaces.some((w) => w.title === renameTrimmed);
    const renameBlocked = renaming || renameTrimmed === "" || renameTarget === null || renameTrimmed === renameTarget.currentTitle || renameDuplicate;
    const closeRename = () => {
      if (renaming) return;
      setRenameTarget(null);
      setRenameError(null);
    };
    const confirmRename = () => {
      if (renameBlocked) return;
      setRenaming(true);
      setRenameError(null);
      renameWorkspace(renameTarget.workspaceId, renameTrimmed).then(() => {
        setRenaming(false);
        setRenameTarget(null);
      }).catch((reason) => {
        setRenaming(false);
        setRenameError(reason instanceof Error ? reason.message : String(reason));
      });
    };
    const [sessionRenameTarget, setSessionRenameTarget] = (0, react2.useState)(null);
    const [sessionRenameDraft, setSessionRenameDraft] = (0, react2.useState)("");
    const [sessionRenaming, setSessionRenaming] = (0, react2.useState)(false);
    const [sessionRenameError, setSessionRenameError] = (0, react2.useState)(null);
    const sessionRenameTrimmed = sessionRenameDraft.trim();
    const sessionRenameBlocked = sessionRenaming || sessionRenameTrimmed === "" || sessionRenameTarget === null;
    const closeSessionRename = () => {
      if (sessionRenaming) return;
      setSessionRenameTarget(null);
      setSessionRenameError(null);
    };
    const confirmSessionRename = () => {
      if (sessionRenameBlocked) return;
      setSessionRenaming(true);
      setSessionRenameError(null);
      renameSession(sessionRenameTarget.sessionId, sessionRenameTrimmed).then(() => {
        setSessionRenaming(false);
        setSessionRenameTarget(null);
      }).catch((reason) => {
        setSessionRenaming(false);
        setSessionRenameError(reason instanceof Error ? reason.message : String(reason));
      });
    };
    const onSessionRename = (sessionId, currentTitle) => {
      setSessionRenameTarget({
        sessionId,
        currentTitle
      });
      setSessionRenameDraft(currentTitle);
      setSessionRenameError(null);
    };
    const onSessionArchive = (sessionId) => {
      archiveSession(sessionId).catch((reason) => {
        console.warn("session archive rejected:", reason);
      });
    };
    const [deleteTarget, setDeleteTarget] = (0, react2.useState)(null);
    const [deleting, setDeleting] = (0, react2.useState)(false);
    const [deleteCommittedId, setDeleteCommittedId] = (0, react2.useState)(null);
    const [deleteError, setDeleteError] = (0, react2.useState)(null);
    (0, react2.useEffect)(() => {
      if (deleteCommittedId === null || workspaces.some((workspace) => workspace.workspaceId === deleteCommittedId)) return;
      setDeleting(false);
      setDeleteCommittedId(null);
      setDeleteTarget(null);
    }, [deleteCommittedId, workspaces]);
    const closeDelete = () => {
      if (deleting) return;
      setDeleteTarget(null);
      setDeleteError(null);
    };
    const confirmDelete = () => {
      if (deleting || deleteTarget === null) return;
      setDeleting(true);
      setDeleteCommittedId(null);
      setDeleteError(null);
      deleteWorkspace(deleteTarget.workspaceId).then(() => {
        setDeleteCommittedId(deleteTarget.workspaceId);
      }).catch((reason) => {
        setDeleting(false);
        setDeleteError(reason instanceof Error ? reason.message : String(reason));
      });
    };
    return (0, react_jsx_runtime.jsxs)("div", {
      className: clsx(WorkspaceBrowser_module_css_default.root, !wide && WorkspaceBrowser_module_css_default.rail),
      children: [
        (0, react_jsx_runtime.jsxs)("div", {
          className: WorkspaceBrowser_module_css_default.sectionHeader,
          children: [
            wide && (0, react_jsx_runtime.jsx)("span", {
              className: clsx(WorkspaceBrowser_module_css_default.sectionLabel, WorkspaceBrowser_module_css_default.wide, searchExpanded && WorkspaceBrowser_module_css_default.sectionLabelHidden),
              children: groupBy === "flat" ? t("section.sessions") : t("section.workspaces")
            }),
            wide && (0, react_jsx_runtime.jsx)("div", {
              className: clsx(WorkspaceBrowser_module_css_default.searchSlot, searchExpanded && WorkspaceBrowser_module_css_default.searchSlotExpanded),
              children: (0, react_jsx_runtime.jsxs)("div", {
                ref: searchRoot,
                className: clsx(WorkspaceBrowser_module_css_default.search, searchExpanded && WorkspaceBrowser_module_css_default.searchExpanded),
                onClick: () => {
                  setWsPickerOpen(false);
                  setSearchExpanded(true);
                  searchInput.current?.focus();
                },
                children: [
                  (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
                    label: t("search"),
                    side: "bottom",
                    delayMs: 500,
                    disabled: searchExpanded,
                    children: (0, react_jsx_runtime.jsx)("button", {
                      type: "button",
                      className: WorkspaceBrowser_module_css_default.searchButton,
                      "aria-label": t("search.sessions.aria"),
                      "aria-expanded": searchExpanded,
                      onClick: () => {
                        setWsPickerOpen(false);
                        setSearchExpanded(true);
                      },
                      children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { size: searchExpanded ? 11 : 14 })
                    })
                  }),
                  (0, react_jsx_runtime.jsx)("input", {
                    ref: searchInput,
                    className: WorkspaceBrowser_module_css_default.searchInput,
                    type: "text",
                    placeholder: t("search.placeholder"),
                    maxLength: SEARCH_QUERY_MAX_CODE_UNITS,
                    value: query,
                    tabIndex: searchExpanded ? 0 : -1,
                    onChange: (e) => {
                      setQuery(sanitizeSearchQuery(e.target.value));
                    },
                    onKeyDown: (e) => {
                      if (e.key !== "Escape") return;
                      setQuery("");
                      setSearchExpanded(false);
                    }
                  }),
                  searchExpanded && (0, react_jsx_runtime.jsx)("button", {
                    type: "button",
                    className: WorkspaceBrowser_module_css_default.clearButton,
                    "aria-label": t("search.clear"),
                    onClick: (e) => {
                      e.stopPropagation();
                      setQuery("");
                      setSearchExpanded(false);
                    },
                    children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseFill14, {})
                  })
                ]
              })
            }),
            (0, react_jsx_runtime.jsxs)("div", {
              className: clsx(WorkspaceBrowser_module_css_default.headerActions, wide && searchExpanded && WorkspaceBrowser_module_css_default.headerActionsHidden),
              children: [wide && (0, react_jsx_runtime.jsx)(ViewOptionsMenu, {
                groupBy,
                orderBy,
                onGroupPick: (mode) => {
                  actions.setGroupBy(mode);
                },
                onOrderPick: (mode) => {
                  actions.setOrderBy(mode);
                },
                t
              }), directoryFlowAvailable && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
                label: t("workspace.add"),
                side: "bottom",
                delayMs: 500,
                children: (0, react_jsx_runtime.jsx)("button", {
                  ref: wsPlusRef,
                  type: "button",
                  className: WorkspaceBrowser_module_css_default.iconButton,
                  "aria-label": t("workspace.add"),
                  onClick: () => {
                    setWsPickerOpen((v) => !v);
                  },
                  children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconProjectAddOutline16, { size: wide ? 16 : 18 })
                })
              })]
            }),
            (0, react_jsx_runtime.jsx)(WorkspacePickFlow, {
              t,
              open: wsPickerOpen,
              anchorRef: wsPlusRef,
              useWorkspaces,
              createWorkspace: createWorkspace2,
              useDirectoryFlow,
              renderDirectoryFlow: (owner) => renderSlot("sidebar.workspaces.directoryFlow", owner),
              addOnly: true,
              side: "right",
              onPick: (workspaceId) => {
                setWsPickerOpen(false);
                startSession(workspaceId);
              },
              onClose: () => {
                setWsPickerOpen(false);
              }
            })
          ]
        }),
        !wide && (0, react_jsx_runtime.jsx)("div", {
          className: WorkspaceBrowser_module_css_default.search,
          children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
            label: t("search"),
            children: (0, react_jsx_runtime.jsx)("button", {
              type: "button",
              className: WorkspaceBrowser_module_css_default.searchButton,
              "aria-label": t("search.sessions.aria"),
              onClick: () => {
                setSearchExpanded(true);
                setSearchOnExpand(true);
                expandSidebar();
              },
              children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { size: 18 })
            })
          })
        }),
        (0, react_jsx_runtime.jsx)("div", {
          className: WorkspaceBrowser_module_css_default.listArea,
          children: wide && (normalizedQuery !== "" ? (0, react_jsx_runtime.jsx)(SearchResults, {
            useSessions,
            useSessionPendingInteraction,
            open,
            workspaces,
            archivedSessionIds,
            query: normalizedQuery,
            remote: remoteSearch,
            resultLimit: searchResultLimit,
            t
          }) : groupBy === "flat" ? (0, react_jsx_runtime.jsx)(FlatList, {
            useSessions,
            useSessionPendingInteraction,
            open,
            forkSession,
            onSessionRename,
            onSessionArchive,
            archivedSessionIds,
            orderBy,
            sessionOrderByAccount,
            sessionUpdatedAtByAccount,
            syncSessionOrderAccount: actions.syncSessionOrderAccount,
            setSessionOrder: actions.setSessionOrder,
            t
          }) : (0, react_jsx_runtime.jsx)(SessionTree, {
            useSessions,
            useSessionPendingInteraction,
            onSessionRename,
            onSessionArchive,
            forkSession,
            workspaces,
            groupExpansion,
            setGroupExpanded: actions.setGroupExpanded,
            sessionOrderByAccount,
            sessionUpdatedAtByAccount,
            syncSessionOrderAccount: actions.syncSessionOrderAccount,
            setSessionOrder: actions.setSessionOrder,
            archivedSessionIds,
            startSession,
            open,
            insertWorkspaceBefore,
            insertSessionBefore,
            orderBy,
            home,
            t,
            onRenameRequest: (workspaceId, currentTitle) => {
              setRenameTarget({
                workspaceId,
                currentTitle
              });
              setRenameDraft(currentTitle);
              setRenameError(null);
            },
            onDeleteRequest: (workspaceId, title) => {
              setDeleteTarget({
                workspaceId,
                title
              });
              setDeleteError(null);
            }
          }))
        }),
        (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
          open: renameTarget !== null,
          onClose: closeRename,
          closeLabel: t("close"),
          title: t("rename.workspace.title"),
          footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
            variant: "outline",
            disabled: renaming,
            onClick: closeRename,
            children: t("cancel")
          }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
            variant: "primary",
            disabled: renameBlocked,
            onClick: confirmRename,
            children: t("rename")
          })] }),
          children: [
            (0, react_jsx_runtime.jsx)("input", {
              className: WorkspaceBrowser_module_css_default.renameInput,
              value: renameDraft,
              "aria-label": t("field.workspaceName"),
              autoFocus: true,
              disabled: renaming,
              onFocus: (e) => {
                e.target.select();
              },
              onChange: (e) => {
                setRenameDraft(e.target.value);
                setRenameError(null);
              },
              onCompositionStart: () => {
                composingRef.current = true;
              },
              onCompositionEnd: () => {
                composingRef.current = false;
              },
              onKeyDown: (e) => {
                if (e.key === "Enter" && !composingRef.current) {
                  e.preventDefault();
                  confirmRename();
                }
              }
            }),
            renameDuplicate && (0, react_jsx_runtime.jsx)("div", {
              className: WorkspaceBrowser_module_css_default.renameError,
              role: "alert",
              children: t("conflict.named", { name: renameTrimmed })
            }),
            renameError !== null && (0, react_jsx_runtime.jsx)("div", {
              className: WorkspaceBrowser_module_css_default.renameError,
              role: "alert",
              children: renameError
            })
          ]
        }),
        (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
          open: sessionRenameTarget !== null,
          onClose: closeSessionRename,
          closeLabel: t("close"),
          title: t("rename.session.title"),
          footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
            variant: "outline",
            disabled: sessionRenaming,
            onClick: closeSessionRename,
            children: t("cancel")
          }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
            variant: "primary",
            disabled: sessionRenameBlocked,
            onClick: confirmSessionRename,
            children: t("rename")
          })] }),
          children: [(0, react_jsx_runtime.jsx)("input", {
            className: WorkspaceBrowser_module_css_default.renameInput,
            value: sessionRenameDraft,
            "aria-label": t("field.sessionName"),
            autoFocus: true,
            disabled: sessionRenaming,
            onFocus: (e) => {
              e.target.select();
            },
            onChange: (e) => {
              setSessionRenameDraft(e.target.value);
              setSessionRenameError(null);
            },
            onCompositionStart: () => {
              composingRef.current = true;
            },
            onCompositionEnd: () => {
              composingRef.current = false;
            },
            onKeyDown: (e) => {
              if (e.key === "Enter" && !composingRef.current) {
                e.preventDefault();
                confirmSessionRename();
              }
            }
          }), sessionRenameError !== null && (0, react_jsx_runtime.jsx)("div", {
            className: WorkspaceBrowser_module_css_default.renameError,
            role: "alert",
            children: sessionRenameError
          })]
        }),
        (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
          open: deleteTarget !== null,
          onClose: closeDelete,
          closeLabel: t("close"),
          title: t("delete.workspace"),
          ...deleteTarget === null ? {} : { description: t("delete.desc", { name: deleteTarget.title }) },
          footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
            variant: "outline",
            disabled: deleting,
            onClick: closeDelete,
            children: t("cancel")
          }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
            variant: "outline",
            className: WorkspaceBrowser_module_css_default.deleteAction,
            disabled: deleting,
            onClick: confirmDelete,
            children: t("delete.workspace")
          })] }),
          children: [deleting && (0, react_jsx_runtime.jsx)("div", {
            className: WorkspaceBrowser_module_css_default.deleteStatus,
            role: "status",
            children: t("delete.pending")
          }), deleteError !== null && (0, react_jsx_runtime.jsx)("div", {
            className: WorkspaceBrowser_module_css_default.renameError,
            role: "alert",
            children: deleteError
          })]
        })
      ]
    });
  }
  const zh = {
    "dshWorktreeManager.workspace": "Worktree",
    "group.ungrouped": "\u672A\u5206\u7EC4",
    "session.new": "\u65B0\u4F1A\u8BDD",
    "section.workspaces": "\u5DE5\u4F5C\u533A",
    "section.sessions": "\u4F1A\u8BDD",
    "viewOptions.label": "\u89C6\u56FE\u9009\u9879",
    "groupBy.label": "\u5206\u7EC4\u65B9\u5F0F",
    "groupBy.workspace": "\u6309\u5DE5\u4F5C\u533A",
    "groupBy.flat": "\u5355\u5217\u8868",
    "orderBy.label": "\u6392\u5E8F\u65B9\u5F0F",
    "orderBy.manual": "\u624B\u52A8\u6392\u5E8F",
    "orderBy.updated": "\u6700\u8FD1\u66F4\u65B0",
    "sessions.expand": "\u5C55\u5F00\u5176\u4F59 {n} \u4E2A\u4F1A\u8BDD",
    "sessions.collapse": "\u6536\u8D77",
    "empty.none": "\u6682\u65E0\u4F1A\u8BDD",
    "empty.noMatches": "\u65E0\u5339\u914D\u7ED3\u679C",
    "workspace.add": "\u6DFB\u52A0\u5DE5\u4F5C\u533A",
    "search.sessions.aria": "\u641C\u7D22\u4F1A\u8BDD",
    "search.placeholder": "\u641C\u7D22\u4F1A\u8BDD\u2026",
    "search.clear": "\u6E05\u9664\u641C\u7D22",
    "search.results.aria": "\u641C\u7D22\u7ED3\u679C",
    "search.pending": "\u6B63\u5728\u641C\u7D22\u4F1A\u8BDD\u5386\u53F2\u2026",
    "search.unavailable": "\u5185\u5BB9\u641C\u7D22\u6682\u4E0D\u53EF\u7528\uFF0C\u4EC5\u663E\u793A\u540D\u79F0\u5339\u914D\u3002",
    "search.noMatches": "\u65E0\u5339\u914D\u4F1A\u8BDD",
    "search.hasMore": "\u4EC5\u663E\u793A\u524D {n} \u6761\u7ED3\u679C\uFF0C\u8BF7\u7F29\u5C0F\u641C\u7D22\u8303\u56F4\u3002",
    "menu.addWorkspace": "\u6DFB\u52A0\u5DE5\u4F5C\u533A\u2026",
    "picker.loading": "\u6B63\u5728\u52A0\u8F7D\u5DE5\u4F5C\u533A\u2026",
    "conflict.named": "\u5DF2\u5B58\u5728\u540D\u4E3A\u201C{name}\u201D\u7684\u5DE5\u4F5C\u533A\u3002",
    "folderError.title": "\u65E0\u6CD5\u6253\u5F00\u6587\u4EF6\u5939",
    "folderError.retry": "\u91CD\u65B0\u9009\u62E9",
    "rename": "\u91CD\u547D\u540D",
    "rename.workspace.title": "\u91CD\u547D\u540D\u5DE5\u4F5C\u533A",
    "rename.session.title": "\u91CD\u547D\u540D\u4F1A\u8BDD",
    "field.workspaceName": "\u5DE5\u4F5C\u533A\u540D\u79F0",
    "field.sessionName": "\u4F1A\u8BDD\u540D\u79F0",
    "delete.workspace": "\u5220\u9664\u5DE5\u4F5C\u533A",
    "delete.desc": "\u5C06\u628A\u201C{name}\u201D\u4ECE\u5DE5\u4F5C\u533A\u5217\u8868\u4E2D\u79FB\u9664\u3002\u6587\u4EF6\u5939\u4E0E\u4F1A\u8BDD\u8BB0\u5F55\u4F1A\u4FDD\u7559\uFF0C\u5176\u4F1A\u8BDD\u5C06\u663E\u793A\u5728\u201C\u672A\u5206\u7EC4\u201D\u4E0B\u3002",
    "delete.pending": "\u6B63\u5728\u5220\u9664\u5DE5\u4F5C\u533A\u2026",
    "menu.fork": "\u5206\u53C9\u4F1A\u8BDD",
    "menu.archiveSession": "\u5F52\u6863\u4F1A\u8BDD",
    "sessions.count.one": "{n} \u4E2A\u4F1A\u8BDD",
    "sessions.count.other": "{n} \u4E2A\u4F1A\u8BDD",
    "actions.workspace.aria": "\u5DE5\u4F5C\u533A\u201C{name}\u201D\u7684\u64CD\u4F5C",
    "actions.session.aria": "\u4F1A\u8BDD\u201C{name}\u201D\u7684\u64CD\u4F5C",
    "actions.newSession.aria": "\u5728\u201C{name}\u201D\u4E2D\u65B0\u5EFA\u4F1A\u8BDD",
    "status.running": "\u8FDB\u884C\u4E2D",
    "status.subagentsRunning.one": "{n} \u4E2A\u5B50\u4EE3\u7406\u8FD0\u884C\u4E2D",
    "status.subagentsRunning.other": "{n} \u4E2A\u5B50\u4EE3\u7406\u8FD0\u884C\u4E2D",
    "status.idle": "\u7A7A\u95F2",
    "status.waitingApproval": "\u7B49\u5F85\u5BA1\u6279",
    "status.planReview": "\u8BA1\u5212\u5F85\u5BA1",
    "status.waitingAnswer": "\u7B49\u5F85\u56DE\u7B54",
    "status.completed": "\u5DF2\u5B8C\u6210",
    "schedule.active": "\u6709\u6D3B\u52A8\u5B9A\u65F6\u4EFB\u52A1",
    "hover.created": "\u521B\u5EFA\u4E8E {time}",
    "hover.copied": "\u5DF2\u590D\u5236",
    "date.ymd": "{y}\u5E74{m}\u6708{d}\u65E5",
    "time.now": "\u521A\u521A",
    "time.minutes": "{n}\u5206\u949F",
    "time.hours": "{n}\u5C0F\u65F6",
    "time.days": "{n}\u5929",
    "time.months": "{n}\u4E2A\u6708",
    "time.years": "{n}\u5E74",
    "time.ago": "{t}\u524D"
  };
  const en = {
    "dshWorktreeManager.workspace": "Worktree",
    "group.ungrouped": "Ungrouped",
    "session.new": "New Session",
    "section.workspaces": "Workspaces",
    "section.sessions": "Sessions",
    "viewOptions.label": "View options",
    "groupBy.label": "Group by",
    "groupBy.workspace": "WorkSpace",
    "groupBy.flat": "In one list",
    "orderBy.label": "Order by",
    "orderBy.manual": "Manual",
    "orderBy.updated": "Last updated",
    "sessions.expand": "Show {n} more sessions",
    "sessions.collapse": "Show less",
    "empty.none": "No sessions yet",
    "empty.noMatches": "No matches",
    "workspace.add": "Add workspace",
    "search.sessions.aria": "Search sessions",
    "search.placeholder": "Search sessions...",
    "search.clear": "Clear search",
    "search.results.aria": "Search results",
    "search.pending": "Searching session history\u2026",
    "search.unavailable": "Content search is temporarily unavailable. Showing name matches.",
    "search.noMatches": "No matching sessions",
    "search.hasMore": "Showing the first {n} results. Narrow your search.",
    "menu.addWorkspace": "Add workspace\u2026",
    "picker.loading": "Loading workspaces\u2026",
    "conflict.named": "A workspace named \u201C{name}\u201D already exists.",
    "folderError.title": "Couldn\u2019t open folder",
    "folderError.retry": "Choose again",
    "rename": "Rename",
    "rename.workspace.title": "Rename workspace",
    "rename.session.title": "Rename session",
    "field.workspaceName": "Workspace name",
    "field.sessionName": "Session name",
    "delete.workspace": "Delete workspace",
    "delete.desc": "This removes \u201C{name}\u201D from the workspace list. The folder and session logs will be kept. Its sessions will appear under Ungrouped.",
    "delete.pending": "Deleting workspace\u2026",
    "menu.fork": "Fork session",
    "menu.archiveSession": "Archive session",
    "sessions.count.one": "{n} session",
    "sessions.count.other": "{n} sessions",
    "actions.workspace.aria": "Workspace actions for {name}",
    "actions.session.aria": "Session actions for {name}",
    "actions.newSession.aria": "New session in {name}",
    "status.running": "Running",
    "status.subagentsRunning.one": "{n} subagent running",
    "status.subagentsRunning.other": "{n} subagents running",
    "status.idle": "Idle",
    "status.waitingApproval": "Waiting for approval",
    "status.planReview": "Plan awaiting review",
    "status.waitingAnswer": "Waiting for answer",
    "status.completed": "Completed",
    "schedule.active": "Has active scheduled task",
    "hover.created": "Created {time}",
    "hover.copied": "Copied",
    "date.ymd": "{y}-{m}-{d}",
    "time.now": "now",
    "time.minutes": "{n}min",
    "time.hours": "{n}h",
    "time.days": "{n}d",
    "time.months": "{n}mo",
    "time.years": "{n}y",
    "time.ago": "{t} ago"
  };
  const NS = "workspace";
  const inject3 = [
    "slots",
    "sessions",
    "workspaces",
    "locale",
    "remote",
    "remote.directoryPicker"
  ];
  function apply3(ctx) {
    const sessions = ctx.get("sessions");
    const workspaces = ctx.get("workspaces");
    const uiWorkspace = new UiWorkspaceService(ctx, ctx.remote.directoryPicker, workspaces, sessions);
    ctx.slots.provideRoot({ hooks: { workspaces: workspaces.list } });
    ctx.effect(() => ctx.locale.register(NS, {
      zh,
      en
    }), "ui-workspace: dictionaries");
    const searchSessions = async (query, signal) => {
      const result = await sessions.search(query, signal);
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    };
    const flowSource = (hole) => ({
      getSnapshot: () => ctx.slots.entries(hole).length > 0,
      subscribe: (listener) => ctx.slots.subscribe(hole, listener)
    });
    const browserFlowSource = flowSource("sidebar.workspaces.directoryFlow");
    const hostInfo = {
      getSnapshot: () => ctx.remote.$host,
      subscribe: (listener) => ctx.on("connection/reset", listener)
    };
    const pickerFlowSource = flowSource("conversation.hero.workspace.directoryFlow");
    const browserInjected = () => ({
      startSession: (workspaceId) => {
        uiWorkspace.startSession(workspaceId);
      },
      open: (sessionId) => {
        sessions.open(sessionId);
      },
      searchSessions,
      searchResultLimit: sessions.searchResultLimit,
      renameSession: async (sessionId, title) => {
        const session = sessions.binding(sessionId)?.session;
        if (session === void 0) throw new Error(`unknown session "${sessionId}"`);
        const result = await session.rename(title);
        if (!result.ok) throw new Error(result.error.message);
      },
      forkSession: (sessionId) => {
        sessions.fork({
          sessionId,
          increaseTitle: true
        }).then((childId) => {
          sessions.open(childId);
        }).catch(() => {
        });
      },
      renameWorkspace: async (workspaceId, title) => {
        await workspaces.rename(workspaceId, title);
      },
      deleteWorkspace: async (workspaceId) => {
        await workspaces.delete(workspaceId);
      },
      insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
        await workspaces.insertBefore(workspaceId, beforeWorkspaceId);
      },
      archiveSession: async (sessionId) => {
        await uiWorkspace.archiveSession(sessionId);
      },
      insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
        await workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId);
      },
      createWorkspace: (input) => workspaces.create(input),
      hooks: {
        directoryFlow: browserFlowSource,
        hostInfo
      }
    });
    const pickerInjected = () => ({
      createWorkspace: (input) => workspaces.create(input),
      hooks: { directoryFlow: pickerFlowSource }
    });
    ctx.slots.inject("sidebar.workspaces", () => ctx.slots.register({
      name: "sidebar.workspaces",
      children: { "sidebar.workspaces.directoryFlow": {
        kind: "single",
        scope: "root"
      } },
      store: createWorkspaceViewStore(),
      inject: browserInjected,
      locale: NS
    }, WorkspaceBrowser));
    ctx.slots.inject("conversation.hero.workspace", () => ctx.slots.register({
      name: "conversation.hero.workspace",
      children: { "conversation.hero.workspace.directoryFlow": {
        kind: "single",
        scope: "root"
      } },
      inject: pickerInjected,
      locale: NS
    }, WorkspacePicker));
  }
  exports.apply = apply3;
  exports.inject = inject3;
  return module2.exports;
})((specifier) => {
  const value = modules[specifier];
  if (value === void 0) throw new Error("Unsupported official Workspace Client require: " + specifier);
  return value;
});
var apply = official.apply;
var inject = official.inject;

// src/client/workspace-sidebar/index.tsx
var import_react2 = require("react");

// src/client/api.ts
var API_BASE = "/plugins/dsh-worktree-manager/api/";
async function apiGet(action, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}${action}${qs ? `?${qs}` : ""}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}
async function apiPost(action, body) {
  const res = await fetch(`${API_BASE}${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}
var WORKTREE_REFRESH_EVENT = "dsh-worktree-manager:refresh";
var GROUPING_KEY = "dsh-worktree-manager:group-by-worktree";
var GROUPING_TOGGLE_EVENT = "dsh-worktree-manager:toggle-grouping";
function isGroupingEnabled() {
  try {
    return localStorage.getItem(GROUPING_KEY) === "1";
  } catch {
    return false;
  }
}
function setGroupingEnabled(value) {
  try {
    localStorage.setItem(GROUPING_KEY, value ? "1" : "0");
  } catch {
  }
  window.dispatchEvent(new Event(GROUPING_TOGGLE_EVENT));
}

// src/client/workspace-sidebar/model.ts
function normalizePath(value) {
  return value.replace(/\/+$/, "");
}
function matchWorktreeByPath(topology, cwd) {
  const normalized = normalizePath(cwd);
  let best;
  for (const repo of topology.repos) {
    const root = normalizePath(repo.root);
    const candidates = [
      { path: root, branch: repo.mainBranch, main: true },
      ...repo.worktrees.map((wt) => ({ path: normalizePath(wt.path), branch: wt.branch, main: false }))
    ];
    for (const candidate of candidates) {
      const hit = normalized === candidate.path || normalized.startsWith(candidate.path + "/");
      if (!hit) continue;
      if (best !== void 0 && candidate.path.length <= best.length) continue;
      best = {
        length: candidate.path.length,
        match: {
          repoRoot: repo.root,
          repoName: repo.name,
          branch: candidate.branch,
          main: candidate.main
        }
      };
    }
  }
  return best?.match;
}
function projectManagedSidebar(input) {
  const projected = input.workspaces.map((workspace) => ({
    ...workspace,
    sessionIds: [...workspace.sessionIds]
  }));
  const branchBySessionId = {};
  const branchByWorkspaceId = {};
  const mergeByWorkspaceId = {};
  const nested = /* @__PURE__ */ new Set();
  if (input.topology.repos.length === 0) {
    return {
      workspaces: projected,
      branchBySessionId,
      branchByWorkspaceId,
      mergeByWorkspaceId,
      nestedWorkspaceIds: nested
    };
  }
  const worktreeByPath = /* @__PURE__ */ new Map();
  for (const repo of input.topology.repos) {
    for (const wt of repo.worktrees) {
      worktreeByPath.set(normalizePath(wt.path), {
        repoRoot: repo.root,
        branch: wt.branch,
        merged: wt.merged,
        base: repo.mainBranch
      });
    }
  }
  const mainWorkspaceByRoot = /* @__PURE__ */ new Map();
  for (const workspace of projected) {
    const normalized = normalizePath(workspace.path);
    for (const repo of input.topology.repos) {
      if (normalized === normalizePath(repo.root)) {
        mainWorkspaceByRoot.set(repo.root, workspace);
        if (repo.mainBranch !== void 0) {
          branchByWorkspaceId[workspace.workspaceId] = repo.mainBranch;
        }
        break;
      }
    }
  }
  const member = /* @__PURE__ */ new Set();
  for (const workspace of projected) {
    for (const sessionId of workspace.sessionIds) member.add(sessionId);
  }
  const stray = [];
  for (const sessionId of input.sessions.ids) {
    if (member.has(sessionId)) continue;
    const summary = input.sessions.byId[sessionId];
    if (summary === void 0 || summary.cwd === void 0) continue;
    stray.push({ id: sessionId, cwd: normalizePath(summary.cwd), claimed: false });
  }
  const byPathLengthDesc = [...projected].sort(
    (a, b) => normalizePath(b.path).length - normalizePath(a.path).length
  );
  for (const workspace of byPathLengthDesc) {
    const workspacePath = normalizePath(workspace.path);
    for (const entry of stray) {
      if (entry.claimed) continue;
      if (entry.cwd !== workspacePath && !entry.cwd.startsWith(workspacePath + "/")) continue;
      workspace.sessionIds.push(entry.id);
      entry.claimed = true;
    }
  }
  const parentByWorkspaceId = /* @__PURE__ */ new Map();
  for (const workspace of projected) {
    const wt = worktreeByPath.get(normalizePath(workspace.path));
    if (wt === void 0) continue;
    if (wt.branch !== void 0) {
      branchByWorkspaceId[workspace.workspaceId] = wt.branch;
      for (const sessionId of workspace.sessionIds) {
        const summary = input.sessions.byId[sessionId];
        if (summary !== void 0 && !summary.blank) branchBySessionId[sessionId] = wt.branch;
      }
    }
    if (wt.merged !== void 0 && wt.base !== void 0) {
      mergeByWorkspaceId[workspace.workspaceId] = { merged: wt.merged, base: wt.base };
    }
    const main = mainWorkspaceByRoot.get(wt.repoRoot);
    if (main !== void 0 && main.workspaceId !== workspace.workspaceId) {
      nested.add(workspace.workspaceId);
      parentByWorkspaceId.set(workspace.workspaceId, main.workspaceId);
      workspace.__dshWorktreeManagerParent = main.workspaceId;
    }
  }
  const childrenByParent = /* @__PURE__ */ new Map();
  for (const workspace of projected) {
    const parent = parentByWorkspaceId.get(workspace.workspaceId);
    if (parent === void 0) continue;
    const children = childrenByParent.get(parent) ?? [];
    children.push(workspace);
    childrenByParent.set(parent, children);
  }
  for (const [parentId, children] of childrenByParent) {
    const main = projected.find((workspace) => workspace.workspaceId === parentId);
    if (main === void 0) continue;
    const branch = branchByWorkspaceId[parentId];
    const virtual = {
      ...main,
      workspaceId: `${parentId}::dsh-main-worktree`,
      title: branch ?? "main",
      sessionIds: main.sessionIds,
      __dshWorktreeManagerVirtual: true,
      __dshWorktreeManagerHost: parentId,
      __dshWorktreeManagerParent: parentId
    };
    main.sessionIds = [];
    nested.add(virtual.workspaceId);
    if (branch !== void 0) branchByWorkspaceId[virtual.workspaceId] = branch;
    children.unshift(virtual);
  }
  const ordered = [];
  for (const workspace of projected) {
    if (nested.has(workspace.workspaceId)) continue;
    ordered.push(workspace, ...childrenByParent.get(workspace.workspaceId) ?? []);
  }
  return {
    workspaces: ordered,
    branchBySessionId,
    branchByWorkspaceId,
    mergeByWorkspaceId,
    nestedWorkspaceIds: nested
  };
}

// src/client/workspace-sidebar/topology.ts
var import_react = require("react");
function useTopology(sessionKey, workspaceKey) {
  const [topology, setTopology] = (0, import_react.useState)({ repos: [] });
  (0, import_react.useEffect)(() => {
    let active = true;
    const refresh = () => {
      void apiGet("topology").then(
        (value) => {
          if (active) setTopology(value);
        },
        () => {
          if (active) setTopology({ repos: [] });
        }
      );
    };
    refresh();
    window.addEventListener(WORKTREE_REFRESH_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener(WORKTREE_REFRESH_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [sessionKey, workspaceKey]);
  return topology;
}

// src/client/workspace-sidebar/index.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function ManagedOfficialWorkspaceBrowser(props) {
  const OfficialBrowser = props.OfficialBrowser;
  const useWorkspaces = props.useWorkspaces;
  const useSessions = props.useSessions;
  const workspaceState = useWorkspaces((state) => state);
  const sessionState = useSessions((state) => state);
  const workspaceKey = workspaceState.items.map((workspace) => `${workspace.workspaceId}:${workspace.sessionIds.join(",")}`).join("|");
  const sessionKey = sessionState.ids.join("|");
  const topology = useTopology(sessionKey, workspaceKey);
  const [groupingEnabled, setGroupingEnabled2] = (0, import_react2.useState)(isGroupingEnabled());
  (0, import_react2.useEffect)(() => {
    const listener = () => {
      setGroupingEnabled2(isGroupingEnabled());
    };
    window.addEventListener(GROUPING_TOGGLE_EVENT, listener);
    return () => {
      window.removeEventListener(GROUPING_TOGGLE_EVENT, listener);
    };
  }, []);
  const projection = (0, import_react2.useMemo)(() => projectManagedSidebar({
    workspaces: workspaceState.items,
    sessions: sessionState,
    topology: groupingEnabled ? topology : { repos: [] }
  }), [groupingEnabled, sessionState, topology, workspaceState.items]);
  const projectedWorkspaceState = (0, import_react2.useMemo)(() => ({
    ...workspaceState,
    items: projection.workspaces.map((workspace) => {
      const branch = projection.branchByWorkspaceId[workspace.workspaceId];
      const merge = projection.mergeByWorkspaceId[workspace.workspaceId];
      const mergeFields = merge === void 0 ? {} : {
        __dshWorktreeManagerMerged: merge.merged,
        __dshWorktreeManagerMergeLabel: merge.merged ? `\u5DF2\u5408\u5E76\u5230 ${merge.base}` : `\u672A\u5408\u5E76\u5230 ${merge.base}`
      };
      if (projection.nestedWorkspaceIds.has(workspace.workspaceId)) {
        return {
          ...workspace,
          title: branch ?? workspace.title,
          __dshWorktreeManagerNested: true,
          ...branch === void 0 ? {} : { __dshWorktreeManagerBranch: branch },
          ...mergeFields
        };
      }
      return {
        ...workspace,
        ...branch === void 0 ? {} : { __dshWorktreeManagerBranch: branch },
        ...mergeFields
      };
    })
  }), [projection, workspaceState]);
  const projectedSessionState = (0, import_react2.useMemo)(() => {
    const byId = { ...sessionState.byId };
    for (const [sessionId, branch] of Object.entries(projection.branchBySessionId)) {
      const summary = byId[sessionId];
      if (summary === void 0) continue;
      byId[sessionId] = { ...summary, __dshWorktreeManager: { branch } };
    }
    return { ...sessionState, byId };
  }, [projection, sessionState]);
  const useProjectedWorkspaces = ((selector) => selector(projectedWorkspaceState));
  const useProjectedSessions = ((selector) => selector(projectedSessionState));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    OfficialBrowser,
    {
      ...props,
      useWorkspaces: useProjectedWorkspaces,
      useSessions: useProjectedSessions
    }
  );
}
function officialContextProxy(ctx) {
  const proxySlots = new Proxy(ctx.slots, {
    get(target, key, receiver) {
      if (key === "register") {
        return (descriptor, component) => {
          if (descriptor.name !== "sidebar.workspaces") return target.register(descriptor, component);
          const OfficialBrowser = component;
          const Browser = (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            ManagedOfficialWorkspaceBrowser,
            {
              ...props,
              OfficialBrowser
            }
          );
          return target.register(descriptor, Browser);
        };
      }
      return Reflect.get(target, key, receiver);
    }
  });
  return new Proxy(ctx, {
    get(target, key, receiver) {
      if (key === "slots") return proxySlots;
      return Reflect.get(target, key, receiver);
    }
  });
}
function registerManagedWorkspaceSidebar(ctx) {
  apply(officialContextProxy(ctx));
}

// src/client/session-branch-badge.tsx
var import_react3 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function useSessionCwd(sessionId, sessions) {
  const [cwd, setCwd] = (0, import_react3.useState)(void 0);
  (0, import_react3.useEffect)(() => {
    if (sessionId === void 0 || sessions === void 0) return;
    let active = true;
    let timer = 0;
    const tick = () => {
      try {
        const summary = sessions.list.getSnapshot().byId[sessionId];
        if (active && summary?.cwd !== void 0) {
          setCwd(summary.cwd);
          window.clearInterval(timer);
        }
      } catch {
      }
    };
    tick();
    timer = window.setInterval(tick, 2e3);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [sessionId, sessions]);
  return cwd;
}
function BranchIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "4.2", cy: "3.4", r: "1.7", stroke: "currentColor", strokeWidth: "1.2" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "4.2", cy: "12.6", r: "1.7", stroke: "currentColor", strokeWidth: "1.2" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: "11.8", cy: "5", r: "1.7", stroke: "currentColor", strokeWidth: "1.2" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "path",
      {
        d: "M4.2 5.1v5.8M11.8 6.7c0 2.9-3.4 2.6-5.9 3.1",
        stroke: "currentColor",
        strokeWidth: "1.2",
        strokeLinecap: "round"
      }
    )
  ] });
}
function SessionBranchBadge(props) {
  const sessionId = props.sessionId;
  const sessions = SessionBranchBadge.__sessions;
  const [groupingEnabled, setGroupingEnabled2] = (0, import_react3.useState)(isGroupingEnabled());
  (0, import_react3.useEffect)(() => {
    const listener = () => {
      setGroupingEnabled2(isGroupingEnabled());
    };
    window.addEventListener(GROUPING_TOGGLE_EVENT, listener);
    return () => {
      window.removeEventListener(GROUPING_TOGGLE_EVENT, listener);
    };
  }, []);
  const cwd = useSessionCwd(sessionId, sessions);
  const topology = useTopology("", "");
  if (!groupingEnabled) return null;
  if (sessionId === void 0 || cwd === void 0) return null;
  const match = matchWorktreeByPath(topology, cwd);
  if (match === void 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "span",
    {
      style: { display: "inline-flex", alignItems: "center", gap: "4px" },
      title: match.main ? `${match.repoName} \u4E3B\u5DE5\u4F5C\u6811 \xB7 ${match.branch ?? ""}` : `${match.repoName} \xB7 ${match.branch ?? ""}`,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-worktree-manager-sidebar-icon", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BranchIcon, {}) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dsh-worktree-manager-sidebar-badge", "aria-hidden": "true", children: match.branch ?? match.repoName })
      ]
    }
  );
}
function registerSessionBranchBadge(ctx) {
  const sessions = ctx.get("sessions");
  SessionBranchBadge.__sessions = sessions;
  ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
    name: "conversation.session.header.actions",
    id: "worktree-branch-badge",
    order: 25,
    label: "Worktree Branch"
  }, SessionBranchBadge));
}

// src/client/changes-view.tsx
var import_react4 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var TOKEN = (name, fallback) => `var(${name}, ${fallback})`;
var view = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  padding: "12px 16px",
  boxSizing: "border-box",
  fontSize: "13px",
  lineHeight: "20px",
  overflow: "hidden"
};
var panes = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  gap: "10px"
};
var listPane = {
  flex: 1,
  minWidth: 0,
  overflowY: "auto"
};
var diffPane = {
  flex: 1,
  minWidth: 0,
  overflowY: "auto",
  paddingLeft: "12px",
  borderLeft: `1px solid ${TOKEN("--dsw-alias-border-l2", "rgba(0,0,0,0.08)")}`
};
var diffHeader = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  position: "sticky",
  top: 0,
  background: TOKEN("--dsw-alias-bg-base", "inherit"),
  padding: "2px 0 6px",
  fontWeight: 500,
  fontSize: "12px"
};
var diffClose = {
  marginLeft: "auto",
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: "14px",
  lineHeight: "1",
  padding: "2px 4px",
  borderRadius: "4px"
};
var diffBody = {
  margin: "0",
  fontFamily: "ui-monospace, monospace",
  fontSize: "11px",
  lineHeight: "16px",
  whiteSpace: "pre",
  overflowX: "auto",
  tabSize: 4
};
function diffLineStyle(line) {
  const added = line.startsWith("+") && !line.startsWith("+++");
  const removed = line.startsWith("-") && !line.startsWith("---");
  return {
    background: added ? TOKEN("--dsw-alias-state-success-bg", "rgba(46,160,67,0.15)") : removed ? TOKEN("--dsw-alias-state-error-bg", "rgba(248,81,73,0.15)") : void 0,
    color: line.startsWith("@@") ? TOKEN("--dsw-alias-accent", "#0969da") : void 0
  };
}
var toolbar = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "8px",
  color: TOKEN("--dsw-alias-label-tertiary", "rgba(0,0,0,0.4)"),
  fontSize: "12px"
};
var refreshBtn = {
  marginLeft: "auto",
  padding: "2px 10px",
  border: `1px solid ${TOKEN("--dsw-alias-border-l2", "rgba(0,0,0,0.1)")}`,
  borderRadius: "6px",
  background: "transparent",
  color: "inherit",
  fontFamily: "inherit",
  fontSize: "12px",
  cursor: "pointer"
};
var note = {
  margin: "8px 0",
  color: TOKEN("--dsw-alias-label-tertiary", "rgba(0,0,0,0.4)")
};
var errorNote = {
  ...note,
  color: TOKEN("--dsw-alias-state-error-primary", "#f38ba8")
};
var list = {
  margin: "0",
  padding: "0",
  listStyle: "none"
};
var entryRow = {
  padding: "6px 8px",
  borderRadius: "8px",
  cursor: "pointer",
  userSelect: "none"
};
function entryRowStyle(selected) {
  return {
    ...entryRow,
    background: selected ? TOKEN("--dsw-alias-bg-l2", "rgba(0,0,0,0.05)") : "transparent"
  };
}
var entryTitle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var entryMeta = {
  display: "flex",
  gap: "8px",
  color: TOKEN("--dsw-alias-label-tertiary", "rgba(0,0,0,0.4)"),
  fontSize: "11px",
  lineHeight: "16px"
};
var hashText = {
  fontFamily: "ui-monospace, monospace",
  flex: "none"
};
var entryMetaRight = {
  marginLeft: "auto",
  flex: "none"
};
var detailBox = {
  margin: "0 0 6px 14px",
  padding: "4px 0 4px 8px",
  borderLeft: `2px solid ${TOKEN("--dsw-alias-border-l2", "rgba(0,0,0,0.08)")}`
};
var fileRow = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "2px 4px",
  minWidth: "0",
  borderRadius: "4px",
  cursor: "pointer"
};
function fileRowStyle(selected) {
  return {
    ...fileRow,
    background: selected ? TOKEN("--dsw-alias-bg-l2", "rgba(0,0,0,0.05)") : "transparent"
  };
}
var codeBadge = (code) => ({
  flex: "none",
  width: "20px",
  padding: "0 2px",
  boxSizing: "border-box",
  textAlign: "center",
  borderRadius: "4px",
  fontSize: "11px",
  fontFamily: "ui-monospace, monospace",
  color: "#fff",
  background: code.includes("D") ? "#e5534b" : code.includes("R") || code.includes("C") ? "#8250df" : code.includes("A") || code === "??" ? "#1a7f37" : "#9a6700"
});
var filePath = {
  minWidth: "0",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontFamily: "ui-monospace, monospace",
  fontSize: "12px"
};
var origPath = {
  flex: "none",
  color: TOKEN("--dsw-alias-label-tertiary", "rgba(0,0,0,0.4)"),
  fontSize: "11px"
};
var subHeader = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  margin: "8px 0 2px",
  padding: "4px 8px",
  borderRadius: "6px",
  background: TOKEN("--dsw-alias-bg-l2", "rgba(0,0,0,0.04)"),
  fontWeight: 600,
  fontSize: "12px",
  userSelect: "none"
};
var subBadge = {
  flex: "none",
  padding: "0 6px",
  borderRadius: "8px",
  fontSize: "10px",
  lineHeight: "16px",
  background: TOKEN("--dsw-alias-badge-bg", "rgba(0,0,0,0.1)"),
  color: TOKEN("--dsw-alias-label-secondary", "inherit")
};
var subBody = {
  margin: "0 0 0 14px",
  paddingLeft: "8px",
  borderLeft: `2px solid ${TOKEN("--dsw-alias-border-l2", "rgba(0,0,0,0.08)")}`
};
var commitLine = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "12px",
  color: TOKEN("--dsw-alias-label-secondary", "inherit")
};
var STR = navigator.language.startsWith("zh") ? {
  tab: "\u53D8\u66F4",
  refresh: "\u5237\u65B0",
  loading: "\u6B63\u5728\u8BFB\u53D6 git \u5386\u53F2\u2026",
  notRepo: "\u5F53\u524D\u4F1A\u8BDD\u76EE\u5F55\u4E0D\u662F git \u4ED3\u5E93",
  error: "\u52A0\u8F7D\u5931\u8D25",
  worktree: "\u672A\u63D0\u4EA4\u7684\u53D8\u66F4",
  newCommits: "\u65B0\u63D0\u4EA4",
  nChanges: (n) => `${n} \u4E2A\u53D8\u66F4`,
  noChanges: "\u65E0\u53D8\u66F4",
  clean: "\u5DE5\u4F5C\u533A\u65E0\u53D8\u66F4",
  subNoFileChange: "\u5DE5\u4F5C\u533A\u6587\u4EF6\u65E0\u6539\u52A8\uFF08HEAD \u4E0E\u7D22\u5F15\u4E0D\u4E00\u81F4\uFF09",
  pointerCommits: "\u5B50\u6A21\u5757\u63D0\u4EA4",
  subUnavailable: "\u5B50\u6A21\u5757\u4ED3\u5E93\u4E0D\u53EF\u7528",
  noDiff: "\u65E0\u5185\u5BB9\u5DEE\u5F02",
  justNow: "\u521A\u521A",
  minutesAgo: "\u5206\u949F\u524D",
  hoursAgo: "\u5C0F\u65F6\u524D",
  daysAgo: "\u5929\u524D",
  summary: (commits) => `${commits} \u4E2A\u63D0\u4EA4`
} : {
  tab: "Changes",
  refresh: "Refresh",
  loading: "Reading git history\u2026",
  notRepo: "The session directory is not a git repository",
  error: "Failed to load",
  worktree: "Uncommitted changes",
  newCommits: "new commits",
  nChanges: (n) => `${n} changes`,
  noChanges: "No changes",
  clean: "No changes",
  subNoFileChange: "No working-tree changes (HEAD differs from index)",
  pointerCommits: "Submodule commits",
  subUnavailable: "Submodule repository unavailable",
  justNow: "just now",
  minutesAgo: "min ago",
  hoursAgo: "h ago",
  daysAgo: "d ago",
  summary: (commits) => `${commits} commits`
};
function relTime(ms) {
  const diff = Date.now() - ms;
  const minute = 6e4;
  if (diff < minute) return STR.justNow;
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} ${STR.minutesAgo}`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / 36e5)} ${STR.hoursAgo}`;
  if (diff < 30 * 864e5) return `${Math.floor(diff / 864e5)} ${STR.daysAgo}`;
  return new Date(ms).toLocaleDateString();
}
var fileKey = (f) => `${f.sub}\0${f.file}`;
function FileRows(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { style: list, children: props.files.map((file) => {
    const selection = { sub: props.sub, file: file.path, ...props.hash !== void 0 ? { hash: props.hash } : {} };
    const key = fileKey(selection);
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "li",
      {
        style: fileRowStyle(props.selected !== null && fileKey(props.selected) === key),
        title: file.path,
        onClick: () => {
          props.onSelect(selection);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: codeBadge(file.code), children: file.code }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: filePath, children: file.path }),
          file.origPath !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: origPath, children: [
            "\u2190 ",
            file.origPath
          ] })
        ]
      },
      `${file.code}:${file.path}`
    );
  }) });
}
function SubmoduleHead({ sub, badge }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: subHeader, title: sub.path, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: sub.name }),
    sub.newCommits && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: subBadge, children: STR.newCommits }),
    badge !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: subBadge, children: badge })
  ] });
}
function WorktreeDetail(props) {
  const subCount = props.data.submodules.length;
  const fileCount = props.data.files.length + props.data.submodules.reduce((n, sub) => n + sub.files.length, 0);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    props.data.files.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(FileRows, { files: props.data.files, sub: "", selected: props.selected, onSelect: props.onSelect }),
    props.data.submodules.map((sub) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SubmoduleHead, { sub }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: subBody, children: sub.files.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(FileRows, { files: sub.files, sub: sub.path, selected: props.selected, onSelect: props.onSelect }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: note, children: sub.newCommits ? STR.subNoFileChange : STR.noChanges }) })
    ] }, sub.path)),
    fileCount === 0 && subCount === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: note, children: STR.clean })
  ] });
}
function CommitDetail(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    props.detail.files.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(FileRows, { files: props.detail.files, sub: "", hash: props.hash, selected: props.selected, onSelect: props.onSelect }),
    props.detail.submodules.map((sub) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: subHeader, title: sub.path, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: sub.name }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: subBadge, children: STR.pointerCommits })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: subBody, children: sub.commits.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { style: list, children: sub.commits.map((line) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { style: commitLine, children: line }, line)) }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: note, children: STR.subUnavailable }) })
    ] }, sub.path)),
    props.detail.files.length === 0 && props.detail.submodules.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: note, children: STR.noChanges })
  ] });
}
function ChangesView(props) {
  const sessionId = props.sessionId;
  const sessions = ChangesView.__sessions;
  const cwd = useSessionCwd(sessionId, sessions);
  const [reload, setReload] = (0, import_react4.useState)(0);
  const [history, setHistory] = (0, import_react4.useState)({ phase: "loading" });
  const [worktree, setWorktree] = (0, import_react4.useState)({ phase: "loading" });
  const [selected, setSelected] = (0, import_react4.useState)({ kind: "worktree" });
  const [commitDetail, setCommitDetail] = (0, import_react4.useState)({ phase: "loading" });
  const [selectedFile, setSelectedFile] = (0, import_react4.useState)(null);
  const [fileDiff, setFileDiff] = (0, import_react4.useState)({ phase: "loading" });
  (0, import_react4.useEffect)(() => {
    if (cwd === void 0) return;
    let cancelled = false;
    setHistory({ phase: "loading" });
    setWorktree({ phase: "loading" });
    void (async () => {
      try {
        const [h, w] = await Promise.all([
          apiGet("history", { path: cwd }),
          apiGet("changes", { path: cwd })
        ]);
        if (!cancelled) {
          setHistory({ phase: "ready", data: h });
          setWorktree({ phase: "ready", data: w });
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setHistory({ phase: "error", message });
          setWorktree({ phase: "error", message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, reload]);
  (0, import_react4.useEffect)(() => {
    if (selected?.kind !== "commit" || cwd === void 0) return;
    let cancelled = false;
    setCommitDetail({ phase: "loading" });
    void (async () => {
      try {
        const data = await apiGet("commit", { path: cwd, hash: selected.hash });
        if (!cancelled) setCommitDetail({ phase: "ready", data });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setCommitDetail({ phase: "error", message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, selected, reload]);
  (0, import_react4.useEffect)(() => {
    if (selectedFile === null || cwd === void 0) return;
    let cancelled = false;
    setFileDiff({ phase: "loading" });
    void (async () => {
      try {
        const data = await apiGet("diff", {
          path: cwd,
          file: selectedFile.file,
          ...selectedFile.sub !== "" ? { sub: selectedFile.sub } : {},
          ...selectedFile.hash !== void 0 ? { hash: selectedFile.hash } : {}
        });
        if (!cancelled) setFileDiff({ phase: "ready", data });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setFileDiff({ phase: "error", message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, selectedFile, reload]);
  (0, import_react4.useEffect)(() => {
    const listener = () => {
      setReload((prev) => prev + 1);
    };
    window.addEventListener(WORKTREE_REFRESH_EVENT, listener);
    return () => {
      window.removeEventListener(WORKTREE_REFRESH_EVENT, listener);
    };
  }, []);
  const toggle = (next) => {
    setSelected((prev) => JSON.stringify(prev) === JSON.stringify(next) ? null : next);
  };
  const refresh = () => {
    setReload((prev) => prev + 1);
  };
  if (sessionId === void 0) return null;
  const notRepo = history.phase === "error" && history.message.includes("not a git repository");
  const commits = history.phase === "ready" ? history.data.commits : [];
  const worktreeData = worktree.phase === "ready" ? worktree.data : void 0;
  const worktreeCount = (worktreeData?.files.length ?? 0) + (worktreeData?.submodules.reduce((n, sub) => n + sub.files.length, 0) ?? 0);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: view, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: toolbar, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { title: history.phase === "ready" ? history.data.root : cwd, children: [
        history.phase === "ready" && history.data.branch !== void 0 ? `${history.data.branch} \xB7 ` : "",
        history.phase === "ready" ? STR.summary(commits.length) : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: refreshBtn, onClick: refresh, children: STR.refresh })
    ] }),
    history.phase === "loading" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: note, children: STR.loading }),
    notRepo && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: note, children: STR.notRepo }),
    !notRepo && history.phase === "error" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: errorNote, role: "alert", children: [
      STR.error,
      "\uFF1A",
      history.message
    ] }),
    history.phase === "ready" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: panes, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("ul", { style: { ...list, ...listPane }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "li",
          {
            style: entryRowStyle(selected?.kind === "worktree"),
            onClick: () => {
              toggle({ kind: "worktree" });
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: entryTitle, children: STR.worktree }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: entryMeta, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: worktreeData !== void 0 ? STR.nChanges(worktreeCount) : "" }) })
            ]
          }
        ),
        selected?.kind === "worktree" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: detailBox, children: [
          worktree.phase === "loading" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: note, children: STR.loading }),
          worktree.phase === "error" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: errorNote, children: [
            STR.error,
            "\uFF1A",
            worktree.message
          ] }),
          worktree.phase === "ready" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(WorktreeDetail, { data: worktree.data, selected: selectedFile, onSelect: setSelectedFile })
        ] }) }),
        commits.map((commit) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "div",
            {
              style: entryRowStyle(selected?.kind === "commit" && selected.hash === commit.hash),
              onClick: () => {
                toggle({ kind: "commit", hash: commit.hash });
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: entryTitle, children: commit.subject }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: entryMeta, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: hashText, children: commit.hash.slice(0, 8) }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: commit.author }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: entryMetaRight, children: relTime(commit.date) })
                ] })
              ]
            }
          ),
          selected?.kind === "commit" && selected.hash === commit.hash && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: detailBox, children: [
            commitDetail.phase === "loading" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: note, children: STR.loading }),
            commitDetail.phase === "error" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: errorNote, children: [
              STR.error,
              "\uFF1A",
              commitDetail.message
            ] }),
            commitDetail.phase === "ready" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(CommitDetail, { detail: commitDetail.data, hash: commit.hash, selected: selectedFile, onSelect: setSelectedFile })
          ] })
        ] }, commit.hash))
      ] }),
      selectedFile !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: diffPane, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: diffHeader, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { title: selectedFile.file, children: selectedFile.file }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              style: diffClose,
              "aria-label": "Close",
              onClick: () => {
                setSelectedFile(null);
              },
              children: "\u2715"
            }
          )
        ] }),
        fileDiff.phase === "loading" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: note, children: STR.loading }),
        fileDiff.phase === "error" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: errorNote, children: [
          STR.error,
          "\uFF1A",
          fileDiff.message
        ] }),
        fileDiff.phase === "ready" && (fileDiff.data.diff !== "" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { style: diffBody, children: fileDiff.data.diff.split("\n").map((line, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: diffLineStyle(line), children: line }, i)) }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: note, children: STR.noChanges }))
      ] })
    ] })
  ] });
}
function registerChangesView(ctx) {
  const sessions = ctx.get("sessions");
  ChangesView.__sessions = sessions;
  ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view",
    id: "worktree-changes",
    order: 20,
    label: () => STR.tab
  }, ChangesView));
}

// src/client/index.ts
var inject2 = [...inject];
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}
function basename(p) {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}
var STYLE_ID = "dsh-worktree-manager-style";
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = el("style", { id: STYLE_ID });
  style.textContent = `
.dsh-wt-inject-btn {
  display: inline-flex; align-items: center; gap: 4px;
  height: 28px; padding: 0 6px 0 8px; border-radius: 6px; cursor: pointer; font-size: 13px;
  border: none !important; outline: none !important; background: transparent;
  color: var(--dsh-fg, inherit); flex: none;
}
.dsh-wt-inject-btn:hover { background: var(--dsh-hover, rgba(0,0,0,0.05)); }
.dsh-wt-inject-btn .dsh-wt-icon { display: inline-flex; flex: none; }
.dsh-wt-inject-btn .dsh-wt-caret {
  display: inline-flex; flex: none; opacity: 0.6;
  transition: transform 0.15s ease;
}
.dsh-wt-inject-btn[data-open="true"] .dsh-wt-caret { transform: rotate(180deg); }
.dsh-wt-dropdown {
  position: fixed; z-index: 10000; min-width: 280px; max-width: 480px;
  max-height: 360px; overflow-y: auto;
  background: var(--dsh-bg, #fff); color: var(--dsh-fg, inherit);
  border: 1px solid var(--dsh-border, rgba(0,0,0,0.1));
  border-radius: 8px; box-shadow: 0 6px 24px rgba(0,0,0,0.15);
  font-family: inherit; font-size: 13px;
}
.dsh-wt-dropdown-header {
  padding: 8px 12px; font-size: 12px; opacity: 0.6;
  border-bottom: 1px solid var(--dsh-border, rgba(0,0,0,0.06));
  position: sticky; top: 0; background: inherit;
}
.dsh-wt-dropdown-item {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 12px; cursor: pointer; border: none; width: 100%;
  background: transparent; color: inherit; text-align: left; font-size: 13px;
}
.dsh-wt-dropdown-item:hover { background: var(--dsh-hover, rgba(0,0,0,0.05)); }
.dsh-wt-dropdown-item-info { flex: 1; min-width: 0; }
.dsh-wt-dropdown-item-path { font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-wt-dropdown-item-badge {
  font-size: 10px; padding: 1px 5px; border-radius: 3px;
  background: var(--dsh-badge, rgba(0,0,0,0.1)); flex: none;
}
.dsh-wt-dropdown-loading { padding: 16px; text-align: center; opacity: 0.6; }
.dsh-wt-dropdown-error { padding: 12px; color: #f38ba8; font-size: 12px; }
.dsh-wt-dropdown-create {
  display: flex; gap: 6px; padding: 8px 12px;
  border-top: 1px solid var(--dsh-border, rgba(0,0,0,0.06));
}
.dsh-wt-dropdown-input {
  flex: 1; padding: 6px 8px; font-size: 13px;
  border: 1px solid var(--dsh-border, rgba(0,0,0,0.15)); border-radius: 4px;
  background: var(--dsh-input-bg, #fff); color: inherit;
}
.dsh-wt-dropdown-btn {
  padding: 6px 10px; font-size: 12px; border-radius: 4px; cursor: pointer;
  border: none; background: var(--dsh-accent, #89b4fa); color: var(--dsh-accent-fg, #fff);
}
.dsh-wt-dropdown-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dsh-wt-dropdown-btn-secondary {
  background: transparent; color: inherit;
  border: 1px solid var(--dsh-border, rgba(0,0,0,0.15));
}
.dsh-wt-repo-group { border-bottom: 1px solid var(--dsh-border, rgba(0,0,0,0.06)); }
.dsh-wt-repo-group:last-child { border-bottom: none; }
.dsh-wt-repo-empty { padding: 8px 12px; font-size: 11px; opacity: 0.5; }
/* Nested worktree group\uFF1A\u76F8\u5BF9\u4ED3\u5E93\u4E3B\u884C\u591A\u4E00\u7EA7\u7F29\u8FDB + \u5DE6\u4FA7\u5C42\u7EA7\u5F15\u5BFC\u7EBF */
.dsh-worktree-manager-nested {
  margin-left: 12px;
  padding-left: 6px;
  border-left: 1px solid var(--dsh-border, rgba(0,0,0,0.08));
}
/* Sidebar branch badges\uFF08\u5BF9\u9F50 dsh-git-worktree \u72B6\u6001\u5FBD\u6807\u7684\u89C6\u89C9\uFF1Aaccent \u8272\u5B57 + \u8272\u5E95 + \u8272\u8FB9\u6846 pill\uFF09 */
.dsh-worktree-manager-sidebar-icon,
.dsh-worktree-manager-sidebar-badge { flex: 0 1 auto; min-width: 0; }
.dsh-worktree-manager-sidebar-icon { flex: 0 0 auto; }
.dsh-worktree-manager-sidebar-icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-state-business-primary, #89b4fa);
}
.dsh-worktree-manager-sidebar-badge {
  --dsh-wt-sidebar-accent: var(--dsw-alias-state-business-primary, #89b4fa);
  box-sizing: border-box;
  max-width: 200px;
  min-height: 20px;
  padding: 1px 6px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--dsh-wt-sidebar-accent) 24%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsh-wt-sidebar-accent) 10%, transparent);
  color: var(--dsh-wt-sidebar-accent);
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* \u5DF2\u5408\u5E76\u5230\u57FA\u51C6\u5206\u652F\uFF08\u4ED3\u5E93\u4E3B\u5DE5\u4F5C\u6811\u5206\u652F\uFF09\u7684 worktree\uFF1A\u56FE\u6807\u4E0E pill \u90FD\u6362\u6210 success \u7EFF */
.dsh-worktree-manager-sidebar-badge.dsh-worktree-manager-merged {
  --dsh-wt-sidebar-accent: var(--dsw-alias-state-success-primary, #a6e3a1);
}
.dsh-worktree-manager-sidebar-icon.dsh-worktree-manager-merged {
  color: var(--dsw-alias-state-success-primary, #a6e3a1);
}
`;
  document.head.appendChild(style);
}
var workspacesService;
var sessionsService;
function listWorkspaces() {
  try {
    return workspacesService?.list.getSnapshot().items ?? [];
  } catch {
    return [];
  }
}
function findWorkspace(path) {
  return listWorkspaces().find((it) => it.path === path) ?? null;
}
async function createWorkspace(path) {
  if (workspacesService === void 0) {
    throw new Error("workspaces \u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u5BA2\u6237\u7AEF\u5C1A\u672A\u5B8C\u6210\u521D\u59CB\u5316");
  }
  return workspacesService.create({ path });
}
function normalizePathKey(value) {
  return value.replace(/\/+$/, "");
}
async function ensureAndSwitchWorkspace(path) {
  if (sessionsService === void 0) {
    throw new Error("sessions \u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u5BA2\u6237\u7AEF\u5C1A\u672A\u5B8C\u6210\u521D\u59CB\u5316");
  }
  let ws = findWorkspace(path);
  if (!ws) ws = await createWorkspace(path);
  if (!ws) throw new Error(`workspace \u521B\u5EFA\u5931\u8D25\uFF1A${path}`);
  const key = normalizePathKey(path);
  let blank;
  try {
    const snapshot = sessionsService.list.getSnapshot();
    for (const id of snapshot.ids) {
      const summary = snapshot.byId[id];
      if (summary === void 0 || !summary.blank) continue;
      if (summary.cwd !== void 0 && normalizePathKey(summary.cwd) === key) {
        blank = summary;
        break;
      }
    }
  } catch {
  }
  if (blank !== void 0) {
    sessionsService.open(blank.id);
  } else {
    const sessionId = await sessionsService.create({ workspaceId: ws.workspaceId });
    sessionsService.open(sessionId);
  }
  window.dispatchEvent(new Event(WORKTREE_REFRESH_EVENT));
}
var activeDropdown = null;
function closeDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
  document.querySelector(`[${INJECT_MARKER}]`)?.removeAttribute("data-open");
  document.removeEventListener("click", onDocClick);
}
function onDocClick(e) {
  if (activeDropdown && !activeDropdown.contains(e.target)) {
    closeDropdown();
  }
}
async function showWorktreeDropdown(trigger) {
  closeDropdown();
  trigger.setAttribute("data-open", "true");
  injectStyles();
  const rect = trigger.getBoundingClientRect();
  const dropdown = el("div", { class: "dsh-wt-dropdown" });
  dropdown.style.left = `${rect.left}px`;
  dropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
  dropdown.style.top = "auto";
  activeDropdown = dropdown;
  document.body.appendChild(dropdown);
  setTimeout(() => document.addEventListener("click", onDocClick), 0);
  dropdown.appendChild(el("div", { class: "dsh-wt-dropdown-loading", text: "\u6B63\u5728\u626B\u63CF git \u4ED3\u5E93\u2026" }));
  let repos;
  try {
    const reposRes = await apiGet("repos", {});
    repos = reposRes.repos;
  } catch (err) {
    dropdown.innerHTML = "";
    const msg = err instanceof Error ? err.message : String(err);
    dropdown.appendChild(el("div", { class: "dsh-wt-dropdown-error", text: msg }));
    return;
  }
  if (repos.length === 0) {
    dropdown.innerHTML = "";
    dropdown.appendChild(el("div", { class: "dsh-wt-dropdown-error", text: "\u5F53\u524D\u6240\u6709\u5DE5\u4F5C\u533A\u5747\u4E0D\u662F git \u4ED3\u5E93" }));
    return;
  }
  const wsItems = listWorkspaces();
  let currentName = "";
  for (const label of WORKSPACE_CHIP_LABELS) {
    const wsBtn = document.querySelector(
      `button[aria-haspopup="menu"][aria-label="${label}"]`
    );
    if (wsBtn) {
      const labelSpan = wsBtn.querySelector("span");
      currentName = (labelSpan?.textContent ?? wsBtn.textContent ?? "").trim();
      break;
    }
  }
  let currentWs = wsItems.find((it) => it.title === currentName) ?? null;
  if (currentWs === null) {
    try {
      const snap = sessionsService?.list.getSnapshot();
      const cwd = snap?.current !== void 0 ? snap.byId[snap.current]?.cwd : void 0;
      if (cwd !== void 0) {
        currentWs = wsItems.find((it) => cwd === it.path || cwd.startsWith(it.path + "/")) ?? null;
      }
    } catch {
    }
  }
  const currentRepoRoot = currentWs !== null ? repos.find((r) => currentWs.path === r.root || currentWs.path.startsWith(r.root + "/"))?.root ?? null : null;
  const targetRepos = currentRepoRoot !== null ? repos.filter((r) => r.root === currentRepoRoot) : currentWs === null ? repos : [];
  if (targetRepos.length === 0) {
    dropdown.innerHTML = "";
    dropdown.appendChild(el("div", { class: "dsh-wt-dropdown-error", text: "\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u5C5E\u4E8E\u4EFB\u4F55 git \u4ED3\u5E93" }));
    return;
  }
  dropdown.innerHTML = "";
  dropdown.appendChild(el("div", { class: "dsh-wt-dropdown-loading", text: "\u6B63\u5728\u52A0\u8F7D worktree \u5217\u8868\u2026" }));
  const loaded = await Promise.all(
    targetRepos.map(async (r) => {
      try {
        const listRes = await apiGet("list", { repoPath: r.root });
        return { repo: r, worktrees: listRes.worktrees };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { repo: r, worktrees: [], error: msg };
      }
    })
  );
  dropdown.innerHTML = "";
  const totalWorktrees = loaded.reduce((n, g) => n + g.worktrees.length, 0);
  const headerText = `${loaded.length} \u4E2A\u4ED3\u5E93 \xB7 ${totalWorktrees} \u4E2A worktree`;
  dropdown.appendChild(el("div", { class: "dsh-wt-dropdown-header", text: headerText }));
  const searchBox = el("input", {
    class: "dsh-wt-dropdown-input",
    placeholder: "\u7B5B\u9009 worktree (\u6309\u540D\u79F0/\u5206\u652F/\u8DEF\u5F84)\u2026",
    style: "width:100%;box-sizing:border-box;margin:0;border:0;border-bottom:1px solid var(--dsh-border, rgba(0,0,0,0.06));border-radius:0;padding:8px 12px;"
  });
  dropdown.appendChild(searchBox);
  const listContainer = el("div");
  dropdown.appendChild(listContainer);
  function renderList(filter) {
    listContainer.innerHTML = "";
    const lower = filter.toLowerCase();
    const hasFilter = filter.length > 0;
    let totalShown = 0;
    for (const group of loaded) {
      const filtered = group.worktrees.filter((wt) => {
        if (!hasFilter) return true;
        const name = basename(wt.path).toLowerCase();
        const branch = (wt.branch ?? "").toLowerCase();
        return name.includes(lower) || branch.includes(lower) || wt.path.toLowerCase().includes(lower);
      });
      if (filtered.length === 0 && group.error === void 0) continue;
      totalShown += filtered.length;
      const groupEl = el("div", { class: "dsh-wt-repo-group" });
      if (group.error !== void 0) {
        groupEl.appendChild(el("div", { class: "dsh-wt-repo-empty", text: group.error }));
      }
      for (const wt of filtered) {
        const item = el("button", { class: "dsh-wt-dropdown-item" });
        const info = el("div", { class: "dsh-wt-dropdown-item-info" });
        info.appendChild(el("div", { class: "dsh-wt-dropdown-item-path", text: basename(wt.path), title: wt.path }));
        item.appendChild(info);
        const badges = [];
        if (wt.bare) badges.push("bare");
        if (wt.locked) badges.push("locked");
        if (wt.prunable) badges.push("prunable");
        for (const badge of badges) {
          item.appendChild(el("span", { class: "dsh-wt-dropdown-item-badge", text: badge }));
        }
        item.onclick = async (e) => {
          e.stopPropagation();
          item.setAttribute("disabled", "disabled");
          try {
            await ensureAndSwitchWorkspace(wt.path);
            closeDropdown();
          } catch (err) {
            item.removeAttribute("disabled");
            const msg = err instanceof Error ? err.message : String(err);
            dropdown.appendChild(el("div", { class: "dsh-wt-dropdown-error", text: msg }));
          }
        };
        groupEl.appendChild(item);
      }
      listContainer.appendChild(groupEl);
    }
    if (totalShown === 0) {
      listContainer.appendChild(el("div", { class: "dsh-wt-dropdown-loading", text: "\u65E0\u5339\u914D worktree" }));
    }
  }
  searchBox.oninput = () => renderList(searchBox.value);
  searchBox.onclick = (e) => e.stopPropagation();
  renderList("");
  const createRow = el("div", { class: "dsh-wt-dropdown-create" });
  const branchInput = el("input", {
    class: "dsh-wt-dropdown-input",
    placeholder: "\u65B0\u5206\u652F\u540D (\u5982 feature/xxx)"
  });
  createRow.appendChild(branchInput);
  const createBtn = el("button", { class: "dsh-wt-dropdown-btn", text: "\u521B\u5EFA" });
  createBtn.onclick = async (e) => {
    e.stopPropagation();
    const branch = branchInput.value.trim();
    if (!branch) return;
    const repoPath = currentRepoRoot ?? loaded[0].repo.root;
    createBtn.setAttribute("disabled", "disabled");
    try {
      const result = await apiPost("create", {
        repoPath,
        branch,
        newBranch: true
      });
      await ensureAndSwitchWorkspace(result.worktree.path);
      closeDropdown();
    } catch (err) {
      createBtn.removeAttribute("disabled");
      const msg = err instanceof Error ? err.message : String(err);
      dropdown.appendChild(el("div", { class: "dsh-wt-dropdown-error", text: msg }));
    }
  };
  createRow.appendChild(createBtn);
  dropdown.appendChild(createRow);
  searchBox.focus();
}
var INJECT_MARKER = "data-dsh-worktree-btn";
var WORKSPACE_CHIP_LABELS = ["\u9009\u62E9\u5DE5\u4F5C\u533A", "Choose workspace"];
function findWorkspaceWriteAnchor() {
  for (const label of WORKSPACE_CHIP_LABELS) {
    const btn = document.querySelector(
      `button[aria-haspopup="menu"][aria-label="${label}"]`
    );
    if (btn) return btn.closest("span") ?? btn;
  }
  return null;
}
var WT_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h5v8H2zM7 6h3v6H7zM10 3h4v9h-4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
var WT_CARET_SVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2.5 3.75 5 6.25 7.5 3.75" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function injectWorktreeButton() {
  if (document.querySelector(`[${INJECT_MARKER}]`)) return;
  injectStyles();
  const anchor = findWorkspaceWriteAnchor();
  if (!anchor) return;
  const parent = anchor.parentElement;
  if (!parent) return;
  const btn = el("button", {
    class: "dsh-wt-inject-btn",
    [INJECT_MARKER]: "true"
  });
  btn.innerHTML = `<span class="dsh-wt-icon">${WT_ICON_SVG}</span><span>Worktree</span><span class="dsh-wt-caret">${WT_CARET_SVG}</span>`;
  btn.onclick = (e) => {
    e.stopPropagation();
    if (activeDropdown) {
      closeDropdown();
    } else {
      void showWorktreeDropdown(btn);
    }
  };
  const next = anchor.nextSibling;
  if (next) {
    parent.insertBefore(btn, next);
  } else {
    parent.appendChild(btn);
  }
}
var VIEW_OPTION_ITEM_MARKER = "data-dsh-wt-viewoption-item";
var GROUP_BY_LABELS = ["\u5206\u7EC4\u65B9\u5F0F", "Group by"];
var WORKTREE_OPTION_LABEL = {
  "\u5206\u7EC4\u65B9\u5F0F": "\u6309\u5DE5\u4F5C\u6811",
  "Group by": "By worktree"
};
function injectViewOptionsGroupingItem() {
  for (const menu of document.querySelectorAll('div[role="menu"]')) {
    if (menu.querySelector(`[${VIEW_OPTION_ITEM_MARKER}]`) !== null) continue;
    const viewport = menu.firstElementChild;
    if (viewport === null) continue;
    const rows = [...viewport.children];
    const labelIndex = rows.findIndex((row) => GROUP_BY_LABELS.includes(row.textContent?.trim() ?? ""));
    if (labelIndex === -1) continue;
    let last = labelIndex;
    while (last + 1 < rows.length && rows[last + 1].querySelector('button[role="menuitem"]') !== null) last += 1;
    if (last === labelIndex) continue;
    const source = rows[last];
    const item = source.cloneNode(true);
    const button = item.querySelector("button");
    if (button === null) continue;
    item.setAttribute(VIEW_OPTION_ITEM_MARKER, "true");
    const labelText = (rows[labelIndex].textContent ?? "").trim();
    const labelEl = button.querySelector("span");
    if (labelEl !== null) labelEl.textContent = WORKTREE_OPTION_LABEL[labelText] ?? "\u6309\u5DE5\u4F5C\u6811";
    button.title = "\u6309\u5DE5\u4F5C\u6811\u805A\u5408\u4F1A\u8BDD\uFF1A\u9690\u85CF worktree \u72EC\u7ACB\u884C\uFF0C\u628A\u4F1A\u8BDD\u805A\u5408\u5230\u4ED3\u5E93\u4E3B\u884C\u5E76\u663E\u793A\u5206\u652F";
    const items = [...menu.querySelectorAll('button[role="menuitem"]')];
    const selectedItem = items.find((candidate) => candidate.querySelector("svg") !== null);
    const plainItem = items.find((candidate) => candidate.querySelector("svg") === null);
    const baseClass = plainItem?.className ?? button.className;
    let check = button.querySelector("svg");
    if (check === null && selectedItem !== void 0) {
      const svg = [...selectedItem.querySelectorAll("svg")].pop();
      if (svg !== void 0) {
        check = svg.cloneNode(true);
        button.appendChild(check);
      }
    }
    const applyState = (on) => {
      button.className = on && selectedItem !== void 0 ? selectedItem.className : baseClass;
      if (check !== null) check.style.display = on ? "" : "none";
    };
    applyState(isGroupingEnabled());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = !isGroupingEnabled();
      setGroupingEnabled(next);
      applyState(next);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    source.insertAdjacentElement("afterend", item);
  }
}
function setupObserver() {
  injectWorktreeButton();
  injectViewOptionsGroupingItem();
  const observer = new MutationObserver(() => {
    injectWorktreeButton();
    injectViewOptionsGroupingItem();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
function apply2(ctx) {
  registerManagedWorkspaceSidebar(ctx);
  workspacesService = ctx.get("workspaces");
  sessionsService = ctx.get("sessions");
  registerSessionBranchBadge(ctx);
  registerChangesView(ctx);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupObserver);
  } else {
    setupObserver();
  }
}
		module.exports.name = "dsh-worktree-manager";
		return module.exports;
	}
});
