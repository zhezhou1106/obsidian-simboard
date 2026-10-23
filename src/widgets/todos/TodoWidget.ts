import { Notice, setIcon, TFile } from "obsidian";
import { DashboardWidget, WidgetContext, WidgetScope } from "../../core/types";
import { t } from "../../i18n";
import { LineMutator, TASK_LINE_RE, TodoItem, TodoStore } from "../../services/TodoStore";
import { formatDate } from "../../utils/date";
import { prefersReducedMotion } from "../../utils/dom";
import { attachTodoDrag } from "./TodoDrag";

interface TodoData {
	items: TodoItem[];
	path: string;
}

const EASE = "cubic-bezier(.2,.8,.2,1)";
const ANIM_MS = 220;
const CHECK_HOLD_MS = 280;
const CLEAR_ARM_MS = 3000;
const IME_KEYCODE = 229;

/**
 * Todo card backed by one markdown file (see `TodoStore`).
 *
 * Every edit — check, delete, add, reorder, clear — is applied to the DOM right
 * away with a short animation, then written through a serial queue. Rows carry
 * their line index and exact text; each write re-verifies the line before
 * touching it, so the card never needs a full re-render for its own edits.
 */
export const TodoWidget: DashboardWidget<TodoData> = {
	id: "todos",
	layout: "card",
	cardWeight: 3,

	async collect(ctx) {
		const store = ctx.plugin.todos;
		return { items: await store.load(ctx), path: store.path };
	},

	render(el, data, ctx, scope) {
		new TodoCard(el, data, ctx, scope);
	},

	async shouldRefresh(file, oldPath, ctx) {
		const store = ctx.plugin.todos;
		if (!store.concerns(file, oldPath)) return false;
		// Skip echoes of this dashboard's own writes — the DOM already shows them.
		if (file instanceof TFile && file.path === store.path) return !(await store.isOwnEcho(file, ctx));
		return true;
	},
};

class TodoCard {
	private readonly store: TodoStore;
	private readonly reduce = prefersReducedMotion();
	private readonly list: HTMLElement;
	private readonly clearBtn: HTMLButtonElement;
	private readonly input: HTMLInputElement;
	/** Rows whose line index must track the file, including rows still animating out. */
	private readonly tracked = new Set<HTMLElement>();
	private queue: Promise<unknown> = Promise.resolve();
	private clearTimer: number | null = null;

	constructor(
		el: HTMLElement,
		data: TodoData,
		private readonly ctx: WidgetContext,
		private readonly scope: WidgetScope,
	) {
		this.store = ctx.plugin.todos;
		el.addClass("sb-todos");

		// ---- header ----
		const header = el.createEl("h3", { cls: "sb-card-header", text: t("todos.title") });
		const actions = header.createSpan({ cls: "sb-card-actions" });
		this.clearBtn = actions.createEl("button", {
			cls: "sb-btn sb-btn-clear",
			text: t("todos.clearAll"),
			attr: { title: t("todos.clearAll.tooltip"), "aria-label": t("todos.clearAll.tooltip") },
		});
		this.clearBtn.disabled = !data.items.length;
		this.clearBtn.addEventListener("click", (ev) => this.onClearClick(ev));

		const open = actions.createEl("button", {
			cls: "sb-btn",
			text: t("todos.openNote"),
			attr: { title: t("todos.openNote.tooltip", { path: data.path }) },
		});
		open.addEventListener("click", (ev) => {
			ev.preventDefault();
			void ctx.app.workspace.openLinkText(data.path, ctx.sourcePath, false);
		});

		const refresh = actions.createEl("button", {
			cls: "sb-btn sb-btn-icon",
			attr: { title: t("todos.refresh.tooltip"), "aria-label": t("todos.refresh.tooltip") },
		});
		setIcon(refresh, "refresh-cw");
		refresh.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			scope.refresh();
		});

		// ---- list ----
		this.list = el.createDiv({ cls: "sb-todo-list" });
		if (data.items.length) data.items.forEach((item) => this.tracked.add(this.createRow(item)));
		else this.createEmpty();
		this.list.addEventListener("click", (ev) => this.onListClick(ev));
		this.list.addEventListener("keydown", (ev) => {
			if (ev.key === "Enter" || ev.key === " ") this.onListClick(ev);
		});

		// ---- add row ----
		const addRow = el.createDiv({ cls: "sb-add-row" });
		this.input = addRow.createEl("input", {
			cls: "sb-add-input",
			type: "text",
			attr: { placeholder: t("todos.add.placeholder"), "aria-label": t("todos.add.placeholder") },
		});
		const addBtn = addRow.createEl("button", {
			cls: "sb-add-btn",
			attr: { title: t("todos.add.tooltip"), "aria-label": t("todos.add.tooltip") },
		});
		setIcon(addBtn, "plus");
		addBtn.addEventListener("click", (ev) => {
			ev.preventDefault();
			this.submitAdd();
			this.input.focus();
		});
		this.input.addEventListener("keydown", (e) => {
			// isComposing: don't submit while an IME (e.g. pinyin) is converting.
			if (e.key === "Enter" && !e.isComposing && e.keyCode !== IME_KEYCODE) {
				e.preventDefault();
				this.submitAdd();
			}
		});
		// Don't re-render under the user's cursor while they type.
		this.input.addEventListener("focus", () => scope.hold("input"));
		this.input.addEventListener("blur", () => scope.release("input"));

		attachTodoDrag({
			list: this.list,
			liveRows: () => this.liveRows(),
			reducedMotion: this.reduce,
			onReorder: () => this.enqueue(() => this.persistOrder()),
			onDragStart: () => scope.hold("drag"),
			onDragEnd: () => scope.release("drag"),
			register: (fn) => scope.register(fn),
		});

		scope.register(() => {
			if (this.clearTimer !== null) window.clearTimeout(this.clearTimer);
		});
	}

	// ---------- rows ----------

	private createRow(item: Pick<TodoItem, "line" | "raw" | "text" | "addedIso">, before?: Element | null): HTMLElement {
		const row = createDiv({ cls: "sb-task" });
		row.dataset.line = String(item.line);
		row.dataset.raw = item.raw;
		row.createSpan({
			cls: "sb-task-box",
			attr: { role: "checkbox", "aria-checked": "false", tabindex: "0", title: t("todos.markDone"), "aria-label": t("todos.markDone") },
		});
		const text = row.createSpan({ cls: "sb-task-text", text: item.text });
		if (item.addedIso) {
			text.createSpan({ cls: "sb-task-meta", text: t("todos.added", { date: formatDate(item.addedIso, "MMM D") }) });
		}
		const del = row.createSpan({
			cls: "sb-task-del",
			attr: { role: "button", tabindex: "0", title: t("todos.delete"), "aria-label": t("todos.delete") },
		});
		setIcon(del, "x");
		this.list.insertBefore(row, before ?? null);
		return row;
	}

	private createEmpty(): HTMLElement {
		return this.list.createDiv({ cls: "sb-empty", text: t("todos.empty") });
	}

	private liveRows(): HTMLElement[] {
		return Array.from(this.list.querySelectorAll<HTMLElement>(".sb-task:not(.is-leaving)"));
	}

	private lineOf(row: HTMLElement): number {
		return parseInt(row.dataset.line ?? "-1", 10);
	}

	private resolve(lines: string[], row: HTMLElement): number {
		return TodoStore.resolveLine(lines, row.dataset.raw ?? "", this.lineOf(row));
	}

	/** Keeps tracked rows' line indices in step with an insert/delete at `from`. */
	private shiftLines(from: number, delta: number): void {
		this.tracked.forEach((r) => {
			const l = this.lineOf(r);
			if (l >= from) r.dataset.line = String(l + delta);
		});
	}

	// ---------- writes ----------

	private enqueue(fn: () => Promise<unknown>): void {
		this.queue = this.queue.then(fn).catch((e: unknown) => {
			console.error("Simboard: todo update failed", e);
			new Notice(t("todos.error.update", { error: e instanceof Error ? e.message : String(e) }), 4000);
			this.scope.refresh();
		});
	}

	/** Writes through the store; a `false` result means the file drifted, so resync. */
	private async mutate(fn: LineMutator): Promise<string[] | null | false> {
		const res = await this.store.mutate(fn, this.ctx);
		if (res === false) this.scope.refresh();
		return res;
	}

	// ---------- animations ----------

	private collapse(row: HTMLElement, delay = 0): Promise<void> {
		row.addClass("is-leaving");
		return new Promise((resolve) => {
			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				row.remove();
				this.updateEmpty();
				resolve();
			};
			if (this.reduce || !row.animate || !row.isConnected) return finish();
			const cs = getComputedStyle(row);
			row.style.overflow = "hidden";
			const anim = row.animate(
				[
					{ height: `${row.offsetHeight}px`, opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, borderTopWidth: cs.borderTopWidth },
					{ height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", borderTopWidth: "0px" },
				],
				{ duration: ANIM_MS, delay, easing: EASE, fill: "forwards" },
			);
			anim.onfinish = finish;
			anim.oncancel = finish;
		});
	}

	private expand(row: HTMLElement): void {
		if (this.reduce || !row.animate) return;
		const cs = getComputedStyle(row);
		const h = row.offsetHeight;
		row.style.overflow = "hidden";
		const anim = row.animate(
			[
				{ height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px" },
				{ height: `${h}px`, opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
			],
			{ duration: ANIM_MS, easing: EASE },
		);
		anim.onfinish = anim.oncancel = () => (row.style.overflow = "");
	}

	private updateEmpty(): void {
		const has = this.liveRows().length > 0;
		const empty = this.list.querySelector(".sb-empty");
		if (!has && !empty && !this.list.querySelector(".sb-task")) {
			const e = this.createEmpty();
			if (!this.reduce && e.animate) e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE });
		} else if (has && empty) {
			empty.remove();
		}
		this.clearBtn.disabled = !has;
		if (!has) this.disarmClear();
	}

	// ---------- check / delete ----------

	private onListClick(ev: Event): void {
		const target = ev.target as HTMLElement;
		const row = target.closest<HTMLElement>(".sb-task");
		if (!row || !this.list.contains(row)) return;
		if (target.closest(".sb-task-box")) {
			ev.preventDefault();
			ev.stopPropagation();
			this.completeRow(row);
		} else if (target.closest(".sb-task-del")) {
			ev.preventDefault();
			ev.stopPropagation();
			this.deleteRow(row);
		}
	}

	private completeRow(row: HTMLElement): void {
		if (row.hasClass("is-leaving")) return;
		row.addClass("is-checked", "is-leaving");
		row.querySelector(".sb-task-box")?.setAttribute("aria-checked", "true");
		if (!this.liveRows().length) this.clearBtn.disabled = true;
		window.setTimeout(() => void this.collapse(row), this.reduce ? 0 : CHECK_HOLD_MS);
		this.enqueue(async () => {
			await this.mutate((lines) => {
				const at = this.resolve(lines, row);
				if (at < 0) return false;
				lines[at] = TodoStore.completeLine(lines[at], new Date());
				return lines;
			});
			this.tracked.delete(row);
		});
	}

	private deleteRow(row: HTMLElement): void {
		if (row.hasClass("is-leaving")) return;
		void this.collapse(row);
		this.enqueue(async () => {
			let at = -1;
			const res = await this.mutate((lines) => {
				at = this.resolve(lines, row);
				if (at < 0) return false;
				lines.splice(at, 1);
				return lines;
			});
			this.tracked.delete(row);
			if (Array.isArray(res)) this.shiftLines(at + 1, -1);
		});
	}

	// ---------- clear all (click twice to confirm) ----------

	private disarmClear(): void {
		this.clearBtn.removeClass("is-armed");
		this.clearBtn.setText(t("todos.clearAll"));
		if (this.clearTimer !== null) window.clearTimeout(this.clearTimer);
		this.clearTimer = null;
	}

	private onClearClick(ev: MouseEvent): void {
		ev.preventDefault();
		ev.stopPropagation();
		if (this.clearBtn.disabled) return;
		if (!this.clearBtn.hasClass("is-armed")) {
			this.clearBtn.addClass("is-armed");
			this.clearBtn.setText(t("todos.clearAll.confirm"));
			this.clearTimer = window.setTimeout(() => this.disarmClear(), CLEAR_ARM_MS);
			return;
		}
		this.disarmClear();
		this.clearAll();
	}

	private clearAll(): void {
		const rows = this.liveRows();
		if (!rows.length) return;
		rows.forEach((r, k) => void this.collapse(r, this.reduce ? 0 : Math.min(k, 12) * 26));
		this.enqueue(async () => {
			await this.mutate((lines) => {
				const kept = lines.filter((l) => !TASK_LINE_RE.test(l));
				return kept.length === lines.length ? null : kept;
			});
			this.tracked.clear();
		});
	}

	// ---------- add ----------

	private submitAdd(): void {
		const text = this.input.value.trim();
		if (!text) return;
		this.input.value = "";
		this.addTask(text);
	}

	private addTask(text: string): void {
		const now = new Date();
		const raw = TodoStore.newTaskLine(text, now);
		this.enqueue(async () => {
			try {
				await this.store.ensureFile(this.ctx);
			} catch (e) {
				new Notice(t("todos.error.create", { error: e instanceof Error ? e.message : String(e) }), 4000);
				return;
			}
			let at = -1;
			const res = await this.mutate((lines) => {
				at = TodoStore.insertInSection(lines, raw);
				return lines;
			});
			if (!Array.isArray(res) || at < 0) return;
			this.shiftLines(at, 1);
			const parsed = TodoStore.parseLine(raw);
			const before = this.liveRows().find((r) => this.lineOf(r) > at) ?? null;
			const row = this.createRow(
				{ line: at, raw, text: TodoStore.displayText(parsed?.body ?? text), addedIso: TodoStore.addedDate(raw) },
				before,
			);
			this.tracked.add(row);
			this.updateEmpty();
			this.expand(row);
		});
	}

	// ---------- reorder ----------

	private async persistOrder(): Promise<void> {
		const rows = this.liveRows();
		if (rows.length < 2) return;
		await this.mutate((lines) => {
			const slots = rows.map((r) => this.resolve(lines, r));
			if (slots.some((l) => l < 0) || new Set(slots).size !== slots.length) return false;
			const texts = slots.map((l) => lines[l]);
			const sorted = [...slots].sort((a, b) => a - b);
			sorted.forEach((slot, k) => (lines[slot] = texts[k]));
			rows.forEach((r, k) => (r.dataset.line = String(sorted[k])));
			return lines;
		});
	}
}
