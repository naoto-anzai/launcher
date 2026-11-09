// Project Launcher: repos under ~/.config/wt/repo-roots (same file wt-projects reads;
// default ~:1 ~/projects:1 ~/Projects:1), minus repo-skip. Type to filter, ↑/↓ to move.
//   Enter       space already open → go there; else new space: claude (left) + shell (right) in ONE tab
//   Alt+Enter   claude only        Shift+Enter  shell only        Esc  close

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, exec, readTextFile, home, run, theme, props, closeOverlay, shared } from "herdr";

// Mock only in a preview opened by Story (props().storybook); live panes get null. Contract: STORYBOOK.md §3.
function storybook(mod = "launcher") {
  const id = props()?.storybook;
  return id ? { ...DEFAULTS, ...(shared(`storybook:${mod}:${id}`)?.values ?? {}) } : null;
}

// ---- Storybook mock data (used only in a Story preview). Rows: { dir, name, space? }, space = { id, status, branch }.
// Same as the defaults in storybook.json (keep in sync).
const DEFAULTS = { repos: "few", open: "some", query: "none" };

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
    return { ...r, space: s ? { id: `mock-${i}`, status: s[0], branch: s[1] } : undefined };
  });
  return { repos: rows, error: null };
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

const inside = (p, dir) => p === dir || p.startsWith(dir + "/");
function openSpace(repo) {
  const all = panes();
  return spaces().find((s) => {
    if (s.machine) return false;
    const tabs = new Set(s.tabs.map((t) => t.id));
    const at = all.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
    return at && inside(at.toLowerCase(), repo.dir.toLowerCase());
  });
}

export default class Launcher extends View {
  init(_props, cx) {
    this.repos = null;
    this.filter = "";
    this.at = 0;
    this.input = InputState.new({ placeholder: "Open a project…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; cx.notify(); });
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
    const list = (repos ?? []).filter((r) => !f || r.dir.toLowerCase().includes(f));
    // Already-open projects first.
    const rows = list.map((r) => (sb ? r : { ...r, space: openSpace(r) })).sort((a, b) => Boolean(b.space) - Boolean(a.space));
    return { loading: repos === null, error: sb ? mockView(sb).error : this.error, rows, mock: Boolean(sb) };
  }

  go(r, mode) {
    if (!r) return;
    if (storybook()) { this.picked = `${r.name} · ${mode}`; return; } // mock: no side effects
    closeOverlay(props().overlay);
    if (r.space && mode === "default") return run("space.select", { id: r.space.id });
    if (mode === "shell") return run("space.new", { name: r.name, folder: r.dir, machine: "" });
    run("space.new", { name: r.name, folder: r.dir, argv: ["claude"], machine: "" });
    if (mode === "default") run("pane.split", { direction: "right" });
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
        else if (k === "enter") return this.go(rows[this.at], e.modifiers.alt ? "claude" : e.modifiers.shift ? "shell" : "default");
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Open project"))
        .child(div().text_size(11).text_color(t.dim).child("⏎ claude+shell · ⌥⏎ claude · ⇧⏎ shell")))
      .child(h_flex().h(36).flex_none().px(10).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
        .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)))
      .when(mock, (el) => el.child(div().text_size(11).text_color(t.dim).child(`MOCK${this.picked ? " · picked: " + this.picked : ""}`)))
      .child(v_flex().id("lc-list").h(Math.max(60, Math.min(340, rows.length * 34 + 8))).min_h(0).overflow_y_scrollbar()
        .when(loading, (el) => el.child(div().p(10).text_color(t.dim).child("Scanning…")))
        .when(!loading && rows.length === 0, (el) => el.child(div().p(10).text_color(t.dim).child(error ?? "No repositories")))
        .children(rows.map((r, i) =>
          h_flex().id(`lc-${i}`).mx(4).px(10).h(34).flex_none().rounded(7).gap(10).items_center().cursor_pointer()
            .when(i === this.at, (el) => el.bg(t.hover)).hover((s) => s.bg(t.hover))
            .on_click((e) => this.go(r, e.modifiers?.alt ? "claude" : "default"))
            .child(div().w(12).flex_none().text_color(r.space ? (t[r.space.status] ?? t.idle) : t.dim).child(r.space ? "●" : "○"))
            .child(div().truncate().font_semibold().text_color(t.foreground).child(r.name))
            .when(Boolean(r.space?.branch), (el) => el.child(div().text_size(11).text_color(t.accent).child(r.space.branch)))
            .child(div().flex_1())
            .child(div().truncate().text_size(11).text_color(t.dim).child(r.space ? "open" : tilde(r.dir, h))))));
  }
}
