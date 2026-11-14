// Project Launcher: repos under ~/.config/wt/repo-roots (same file wt-projects reads;
// default ~:1 ~/projects:1 ~/Projects:1), minus repo-skip. Type to filter, ↑/↓ to move.
// Lists scanned repos plus EVERY open space (other folders, remote machines).
// One space per machine+folder (matched on space.folder, exactly). Only claude sessions.
//   Enter / click  go to the folder's space; no space yet → open one (space.new running claude, first tab "<folder>")
//   Ctrl+Enter     add a claude session: space exists → select it + new tab (tab "<folder>", then "claude 2", …);
//                  else same as above (new space)
//   Esc            close

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, VirtualListScrollHandle, v_virtual_list } from "gpui-base";
import { spaces, panes, exec, readTextFile, home, run, theme, props, closeOverlay, shared } from "herdr";

// Mock only in a preview opened by Story (props().storybook); live panes get null. Contract: STORYBOOK.md §3.
function storybook(mod = "launcher") {
  const id = props()?.storybook;
  return id ? { ...DEFAULTS, ...(shared(`storybook:${mod}:${id}`)?.values ?? {}) } : null;
}

// ---- Storybook mock data (used only in a Story preview). Rows: { dir, name, space? }, space = { id, status, branch, tabs: [{ name }] }; machine = a remote space's machine.
// Same as the defaults in storybook.json (keep in sync).
const DEFAULTS = { repos: "few", open: "some", sessions: "one", others: "local", dup: "none", query: "none" };

const MOCK_HOME = "/Users/mock";

const FEW = ["dotfiles", "herdr-mods", "lab-notes", "react-tutorial", "zemi-report"];
const LONG = [
  "an-extremely-long-repository-name-that-keeps-going-and-going-for-truncation",
  "日本語のとても長いプロジェクト名を持つリポジトリ",
  "short",
];
const many = () => Array.from({ length: 40 }, (_, i) => `project-${String(i + 1).padStart(2, "0")}`);

function names(repos) {
  if (repos === "few") return FEW.map((n) => ({ name: n, dir: `${MOCK_HOME}/Projects/${n}` }));
  if (repos === "many") return many().map((n) => ({ name: n, dir: `${MOCK_HOME}/Projects/${n}` }));
  if (repos === "long")
    return LONG.map((n, i) => ({
      name: n,
      dir: i === 0 ? `${MOCK_HOME}/Projects/clients/archive/2024/${n}` : `${MOCK_HOME}/Projects/${n}`,
    }));
  return [];
}

const SPACES = {
  some: { 0: ["idle", "main"], 2: ["working", "feat/ui"] },
  blocked: { 0: ["blocked", "main"], 1: ["done", "fix/login"], 2: ["working", "main"], 3: ["idle", null] },
};

// Open spaces that are not a scanned repo: this computer's other folders, and remote machines' spaces.
function extras(others, sessions) {
  const tabs = (n) => (sessions === "many" ? [n, "claude 2", "claude 3"] : [n]).map((name) => ({ name }));
  const local = [
    { name: "~", dir: MOCK_HOME, space: { id: "mock-x1", status: "idle", branch: null, tabs: tabs("~") } },
    { name: "メモ置き場", dir: `${MOCK_HOME}/Documents/notes`, space: { id: "mock-x2", status: "blocked", branch: null, tabs: tabs("メモ置き場") } },
  ];
  const remote = [
    { name: "herdr", dir: "/home/mock/herdr", machine: "mock-wsl", space: { id: "mock-wsl/x3", status: "working", branch: "main", tabs: tabs("herdr") } },
  ];
  return others === "none" ? [] : others === "all" ? [...local, ...remote] : local;
}

// -> { repos: rows | null (loading), error: string | null }
function mockView(sb) {
  const repos = sb.repos ?? "few";
  if (repos === "loading") return { repos: null, error: null };
  if (repos === "error") return { repos: [], error: "Error: find: permission denied" };
  const open = sb.open ?? "some";
  const rows = names(repos).map((r, i) => {
    let s = null;
    if (open === "all") s = ["idle", "main"];
    else if (SPACES[open]?.[i]) s = SPACES[open][i];
    // sessions: one tab named after the folder, or several ("claude 2", "claude 3" next).
    const tabs = (sb.sessions ?? "one") === "many" ? [r.name, "claude 2", "claude 3"] : [r.name];
    const mk = (id) => ({ id, status: s[0], branch: s[1], tabs: tabs.map((name) => ({ name })) });
    const spaces = s ? (sb.dup === "multi" && i === 0 ? [mk(`mock-${i}`), mk(`mock-${i}b`)] : [mk(`mock-${i}`)]) : [];
    return { ...r, space: spaces[0], spaces };
  });
  return { repos: [...rows, ...extras(sb.others ?? "local", sb.sessions ?? "one")], error: null };
}

const MOCK_QUERY = { none: "", match: "herdr", nomatch: "zzzz-no-match" };

const lines = (t) => (t ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const expand = (p, h) => (p === "~" ? h : p.startsWith("~/") ? h + p.slice(1) : p);
const tilde = (p, h) => (p.startsWith(h) ? "~" + p.slice(h.length) : p);

async function scan() {
  const h = home();
  const roots = lines(await readTextFile(`${h}/.config/wt/repo-roots`)).map((l) => {
    const i = l.lastIndexOf(":");
    const depth = i > 0 && /^\d+$/.test(l.slice(i + 1)) ? Number(l.slice(i + 1)) : 1;
    return { path: expand(i > 0 && /^\d+$/.test(l.slice(i + 1)) ? l.slice(0, i) : l, h), depth };
  });
  if (!roots.length) for (const p of ["~", "~/projects", "~/Projects"]) roots.push({ path: expand(p, h), depth: 1 });
  const skip = new Set(lines(await readTextFile(`${h}/.config/wt/repo-skip`)));
  const seen = new Map();
  for (const r of roots) {
    const res = await exec("find", [r.path, "-maxdepth", String(r.depth + 1), "-name", ".git", "-type", "d", "-not", "-path", "*/.herdr/*", "-not", "-path", "*/Library/*"]);
    for (const g of res.stdout.split("\n").filter(Boolean)) {
      const dir = g.slice(0, -5);
      const name = dir.split("/").pop();
      if (skip.has(name)) continue;
      const key = dir.toLowerCase(); // macOS: ~/projects and ~/Projects are one folder
      if (!seen.has(key)) seen.set(key, { dir, name });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Stable per-row key (a space id, else the folder).
const rowKey = (r) => r.space?.id ?? `d:${r.dir}`;

// Folder rule shared with spaces-tree (same function, same rule):
// 1. a space "is at" the live cwd of the first pane (tab by tab) that has one, else space.folder;
// 2. compare without trailing "/"; ignore case only for this computer (machine null), never for remotes;
// 3. sessions never move a space: a session that cd'd elsewhere is still in its space's row.
function placeOf(s, ps) {
  for (const t of s.tabs) {
    const p = ps.find((p) => p.tab === t.id && p.cwd);
    if (p) return p.cwd;
  }
  return s.folder || "";
}
const samePlace = (a, b, machine) => {
  const n = (p) => (p ?? "").replace(/\/+$/, "");
  return machine ? n(a) === n(b) : n(a).toLowerCase() === n(b).toLowerCase();
};

// Groups spaces by (machine, place): [{ machine, dir (original spelling), spaces: [...] }].
function groupSpaces(all, ps) {
  const groups = [];
  for (const s of all) {
    const dir = placeOf(s, ps);
    const g = groups.find((g) => (g.machine ?? null) === (s.machine ?? null) && samePlace(g.dir, dir, s.machine));
    if (g) g.spaces.push(s);
    else groups.push({ machine: s.machine ?? null, dir, spaces: [s] });
  }
  return groups;
}

// Right-hand label of an open row: total tabs, plus the number of spaces when several share the place.
function openLabel(r) {
  const all = r.spaces?.length ? r.spaces : [r.space];
  const tabs = all.reduce((n, s) => n + (s.tabs?.length ?? 0), 0);
  return `open · ${tabs || ""}${all.length > 1 ? ` · ${all.length} spaces` : ""}`.replace(/ · $/, "");
}

// First session keeps the folder name; later ones are "claude 2", "claude 3", ...
function tabName(r) {
  const taken = new Set((r.space?.tabs ?? []).map((t) => t.name));
  if (!taken.has(r.name)) return r.name;
  let n = 2;
  while (taken.has(`claude ${n}`)) n++;
  return `claude ${n}`;
}

// What a choice does: { label, cmds: [[command, args], ...] }. Pure: the mock shows the label only.
// mode "go" moves to the folder's space (opening it if absent); "add" adds a claude session.
function plan(r, mode) {
  const space = r.space;
  if (!space)
    return {
      label: `space.new ${r.name} (claude)`,
      cmds: [["space.new", { name: r.name, folder: r.dir, tab: r.name, argv: ["claude"], machine: "" }]],
    };
  if (mode === "go") return { label: `select ${r.name}`, cmds: [["space.select", { id: space.id }]] };
  const name = tabName(r);
  return {
    label: `tab.new ${name} in ${r.name}`,
    cmds: [["space.select", { id: space.id }], ["tab.new", { space: space.id, ...(r.dir ? { folder: r.dir } : {}), argv: ["claude"], name }]],
  };
}

export default class Launcher extends View {
  init(_props, cx) {
    this.repos = null;
    this.filter = "";
    this.at = 0;
    this.scroll = VirtualListScrollHandle.new();
    this.input = InputState.new({ placeholder: "Open a project…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; this.scroll.scroll_to_item(0); cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  // Live scan starts the first time we render without the mock (mock never runs exec).
  ensureScan(cx) {
    if (this.scanning || storybook()) return;
    this.scanning = true;
    cx.spawn(async (cx) => {
      try { this.repos = await scan(); } catch (e) { this.error = String(e); this.repos = []; }
      cx.notify();
    });
  }

  // { repos (null = scanning), error, rows } from live data or the storybook mock.
  view() {
    const sb = storybook();
    const repos = sb ? mockView(sb).repos : this.repos;
    const f = (sb ? MOCK_QUERY[sb.query ?? "none"] ?? "" : this.filter).toLowerCase();
    let list = repos ?? [];
    if (!sb) {
      // Every open space gets a row. Spaces at the same place share one row (count badge).
      const groups = groupSpaces(spaces(), panes());
      const take = (r) => {
        const g = groups.find((g) => !g.machine && samePlace(g.dir, r.dir, null));
        if (g) g.used = true;
        return { ...r, space: g?.spaces[0], spaces: g?.spaces ?? [] };
      };
      const rows = list.map(take);
      const rest = groups.filter((g) => !g.used).map((g) => ({ dir: g.dir, name: g.spaces[0].name, machine: g.machine, space: g.spaces[0], spaces: g.spaces }));
      list = [...rows, ...rest];
    }
    list = list.filter((r) => !f || `${r.dir} ${r.name} ${r.machine ?? ""}`.toLowerCase().includes(f));
    // Open spaces first.
    const rows = [...list].sort((a, b) => Boolean(b.space) - Boolean(a.space));
    return { loading: repos === null, error: sb ? mockView(sb).error : this.error, rows, mock: Boolean(sb) };
  }

  go(r, mode) {
    if (!r) return;
    const p = plan(r, mode);
    if (storybook()) { this.picked = p.label; return; } // mock: no side effects
    closeOverlay(props().overlay);
    for (const [cmd, args] of p.cmds) run(cmd, args);
  }

  render(cx) {
    this.ensureScan(cx);
    const t = theme();
    const { loading, error, rows, mock } = this.view();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const h = mock ? MOCK_HOME : home();
    return v_flex().id("launcher").track_focus(this.handle).w_full().min_h(0).p(18).gap(10).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return mock ? undefined : closeOverlay(props().overlay);
        if (k === "down") this.at = (this.at + 1) % Math.max(1, rows.length);
        else if (k === "up") this.at = (this.at + rows.length - 1) % Math.max(1, rows.length);
        else if (k === "pagedown") this.at = Math.min(rows.length - 1, this.at + 10);
        else if (k === "pageup") this.at = Math.max(0, this.at - 10);
        else if (k === "enter") return this.go(rows[this.at], e.modifiers.control ? "add" : "go");
        else return;
        this.scroll.scroll_to_item(this.at); // keep the selected row on screen
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Open project"))
        .child(div().text_size(11).text_color(t.dim).child("⏎ go to space · ⌃⏎ new claude session")))
      .child(h_flex().h(36).flex_none().px(10).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
        .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)))
      .when(mock, (el) => el.child(div().text_size(11).text_color(t.dim).child(`MOCK${this.picked ? " · picked: " + this.picked : ""}`)))
      .child(v_flex().relative().h(Math.max(60, Math.min(520, rows.length * 34 + 8))).min_h(0)
        .when(loading, (el) => el.child(div().p(10).text_color(t.dim).child("Scanning…")))
        .when(!loading && rows.length === 0, (el) => el.child(div().p(10).text_color(t.dim).child(error ?? "No repositories")))
        .when(rows.length > 0, (el) => el
          .child(v_virtual_list("lc-list", rows.length, 34, (i) => rowKey(rows[i]), (range) =>
            rows.slice(range.start, range.end).map((r, j) => {
              const i = range.start + j;
              return h_flex().id(`lc-${rowKey(r)}`).mx(4).px(10).h(34).rounded(7).gap(10).items_center().cursor_pointer()
                .when(i === this.at, (el) => el.bg(t.hover))
                .child(div().w(12).flex_none().text_color(r.space ? (t[r.space.status] ?? t.idle) : t.dim).child(r.space ? "●" : "○"))
                .child(div().truncate().font_semibold().text_color(t.foreground).child(r.name))
                .when(Boolean(r.machine), (el) => el.child(div().text_size(10).px(5).rounded(4).bg(t.raised).text_color(t.muted).child(r.machine)))
                .when(Boolean(r.space?.branch), (el) => el.child(div().text_size(11).text_color(t.accent).child(r.space.branch)))
                .child(div().flex_1())
                .child(div().truncate().text_size(11).text_color(t.dim).child(r.space ? openLabel(r) : tilde(r.dir, h)));
            }))
            .size_full().track_scroll(this.scroll)
            .on_item_click((key) => this.go(rows.find((r) => rowKey(r) === key), "go")))
          .child(Scrollbar.vertical("lc-list").absolute().inset_0())));
  }
}
