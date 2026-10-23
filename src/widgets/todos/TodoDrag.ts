/**
 * Pointer-based drag-to-reorder for the todo list (mouse: move 4px to start;
 * touch/pen: long-press). While dragging, the row follows the pointer and its
 * neighbours slide out of the way with CSS transforms; on release the row
 * glides into its slot, the DOM is reordered, and `onReorder` persists it.
 */

export interface TodoDragOptions {
	list: HTMLElement;
	/** Rows that are not animating out, in DOM order. */
	liveRows: () => HTMLElement[];
	reducedMotion: boolean;
	/** Called after the DOM has been reordered. */
	onReorder: () => void;
	/** Drag started / ended — used to defer re-renders while a row is lifted. */
	onDragStart: () => void;
	onDragEnd: () => void;
	/** Registers cleanup with the widget scope. */
	register: (cleanup: () => void) => void;
}

interface Press {
	row: HTMLElement;
	id: number;
	x: number;
	y: number;
	touch: boolean;
	timer: number;
}

interface Drag {
	row: HTMLElement;
	rows: HTMLElement[];
	from: number;
	to: number;
	metrics: { top: number; h: number }[];
	shifts: number[];
	startY: number;
	pointerY: number;
	scroller: HTMLElement;
	startScroll: number;
}

const MOUSE_THRESHOLD_PX = 4;
const TOUCH_CANCEL_PX = 8;
const LONG_PRESS_MS = 280;
const EDGE_PX = 48;
const MAX_SCROLL_STEP = 12;
const DROP_FALLBACK_MS = 260;
const BODY_DRAG_CLASS = "simboard-dragging";

/** Sets (or, with "", clears) a row's inline transform. */
function setTransform(el: HTMLElement, value: string): void {
	el.setCssProps({ transform: value });
}

function findScroller(el: HTMLElement): HTMLElement {
	for (let p = el.parentElement; p; p = p.parentElement) {
		const oy = getComputedStyle(p).overflowY;
		if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
	}
	return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

export function attachTodoDrag(opts: TodoDragOptions): void {
	const { list, liveRows, reducedMotion: reduce } = opts;
	let press: Press | null = null;
	let drag: Drag | null = null;
	let raf = 0;

	const requestFrame = () => {
		if (!raf) raf = window.requestAnimationFrame(frame);
	};

	function frame(): void {
		raf = 0;
		const d = drag;
		if (!d) return;

		// Auto-scroll when the pointer nears the top/bottom edge of the scroller.
		const isDoc = d.scroller === document.scrollingElement || d.scroller === document.documentElement;
		const sr = isDoc ? { top: 0, bottom: window.innerHeight } : d.scroller.getBoundingClientRect();
		let v = 0;
		if (d.pointerY < sr.top + EDGE_PX) v = -Math.ceil(((sr.top + EDGE_PX - d.pointerY) / EDGE_PX) * MAX_SCROLL_STEP);
		else if (d.pointerY > sr.bottom - EDGE_PX) v = Math.ceil(((d.pointerY - (sr.bottom - EDGE_PX)) / EDGE_PX) * MAX_SCROLL_STEP);
		if (v) {
			const before = d.scroller.scrollTop;
			d.scroller.scrollTop = before + v;
			if (d.scroller.scrollTop === before) v = 0;
		}

		const m = d.metrics;
		const from = d.from;
		const last = m[m.length - 1];
		let dy = d.pointerY - d.startY + (d.scroller.scrollTop - d.startScroll);
		dy = Math.max(-m[from].top - 6, Math.min(last.top + last.h - (m[from].top + m[from].h) + 6, dy));
		setTransform(d.row, `translate3d(0,${dy}px,0) scale(1.015)`);

		const center = m[from].top + m[from].h / 2 + dy;
		const H = m[from].h;
		let to = from;
		for (let j = 0; j < d.rows.length; j++) {
			if (j === from) continue;
			const c = m[j].top + m[j].h / 2;
			let s = 0;
			if (j < from && center < c) {
				s = H;
				to--;
			} else if (j > from && center > c) {
				s = -H;
				to++;
			}
			if (d.shifts[j] !== s) {
				d.shifts[j] = s;
				setTransform(d.rows[j], s ? `translate3d(0,${s}px,0)` : "");
			}
		}
		d.to = to;
		if (v) requestFrame();
	}

	function startDrag(): void {
		if (!press) return;
		const row = press.row;
		const rows = liveRows();
		const from = rows.indexOf(row);
		if (from < 0 || rows.length < 2) {
			endPress();
			return;
		}
		const listTop = list.getBoundingClientRect().top;
		const metrics = rows.map((r) => {
			const b = r.getBoundingClientRect();
			return { top: b.top - listTop, h: b.height };
		});
		const scroller = findScroller(list);
		drag = {
			row,
			rows,
			from,
			to: from,
			metrics,
			shifts: rows.map(() => 0),
			startY: press.y,
			pointerY: press.y,
			scroller,
			startScroll: scroller.scrollTop,
		};
		opts.onDragStart();
		try {
			row.setPointerCapture(press.id);
		} catch {
			/* pointer already released */
		}
		list.addClass("is-sorting");
		row.addClass("is-dragging");
		document.body.addClass(BODY_DRAG_CLASS);
		requestFrame();
	}

	function endDrag(commit: boolean): void {
		const d = drag;
		if (!d) return;
		const cancelFrame = () => {
			if (raf) window.cancelAnimationFrame(raf);
			raf = 0;
		};
		cancelFrame();
		// Apply the last pointer position now: a quick flick can be released before
		// any animation frame ran (and hidden windows don't run frames at all).
		if (commit) frame();
		cancelFrame();
		drag = null;
		const { row, rows, from, metrics: m } = d;
		const to = commit ? d.to : from;
		if (!commit) rows.forEach((r) => r !== row && setTransform(r, ""));
		let target = 0;
		if (to > from) target = m[to].top + m[to].h - (m[from].top + m[from].h);
		else if (to < from) target = m[to].top - m[from].top;
		row.removeClass("is-dragging");
		row.addClass("is-dropping");
		setTransform(row, `translate3d(0,${target}px,0)`);
		document.body.removeClass(BODY_DRAG_CLASS);

		let settled = false;
		const settle = () => {
			if (settled) return;
			settled = true;
			list.addClass("is-no-anim");
			rows.forEach((r) => setTransform(r, ""));
			row.removeClass("is-dropping");
			if (to !== from) {
				if (to > from) rows[to].after(row);
				else rows[to].before(row);
			}
			void list.offsetHeight; // flush styles before re-enabling transitions
			list.removeClass("is-no-anim", "is-sorting");
			if (to !== from) opts.onReorder();
			opts.onDragEnd();
		};
		if (reduce) return settle();
		row.addEventListener("transitionend", function onEnd(e: TransitionEvent) {
			if (e.target !== row || e.propertyName !== "transform") return;
			row.removeEventListener("transitionend", onEnd);
			settle();
		});
		window.setTimeout(settle, DROP_FALLBACK_MS);
	}

	function endPress(): void {
		if (!press) return;
		window.clearTimeout(press.timer);
		press = null;
		window.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("pointerup", onPointerUp);
		window.removeEventListener("pointercancel", onPointerUp);
	}

	function onPointerDown(ev: PointerEvent): void {
		if (ev.button !== 0 || !ev.isPrimary) return;
		// A press/drag whose release never arrived: drop it before starting anew.
		if (press) endPress();
		if (drag) endDrag(false);
		const target = ev.target as HTMLElement;
		if (target.closest(".sb-task-box, .sb-task-del")) return;
		const row = target.closest<HTMLElement>(".sb-task");
		if (!row || !list.contains(row) || row.hasClass("is-leaving")) return;
		const touch = ev.pointerType === "touch" || ev.pointerType === "pen";
		press = { row, id: ev.pointerId, x: ev.clientX, y: ev.clientY, touch, timer: 0 };
		if (touch) {
			press.timer = window.setTimeout(() => {
				if (!press || drag) return;
				startDrag();
				try {
					if (drag && navigator.vibrate) navigator.vibrate(8);
				} catch {
					/* vibration unsupported */
				}
			}, LONG_PRESS_MS);
		}
		window.addEventListener("pointermove", onPointerMove, { passive: false });
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("pointercancel", onPointerUp);
	}

	function onPointerMove(ev: PointerEvent): void {
		if (!press || ev.pointerId !== press.id) return;
		// Mouse button already released (e.g. let go outside the window).
		if (!press.touch && ev.buttons === 0) {
			finishPointer(press.id, !!drag);
			return;
		}
		if (!drag) {
			const dist = Math.hypot(ev.clientX - press.x, ev.clientY - press.y);
			if (press.touch) {
				// Moving before the long-press fires means the user is scrolling.
				if (dist > TOUCH_CANCEL_PX) endPress();
				return;
			}
			if (dist < MOUSE_THRESHOLD_PX) return;
			startDrag();
			if (!drag) return;
		}
		ev.preventDefault();
		drag.pointerY = ev.clientY;
		requestFrame();
	}

	function onPointerUp(ev: PointerEvent): void {
		finishPointer(ev.pointerId, ev.type === "pointerup");
	}

	function finishPointer(pointerId: number, commit: boolean): void {
		if (!press || pointerId !== press.id) return;
		const wasDrag = !!drag;
		endPress();
		if (!wasDrag) return;
		endDrag(commit);
		// Swallow the click that follows a drag release.
		const swallow = (e: MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
		};
		window.addEventListener("click", swallow, { capture: true, once: true });
		window.setTimeout(() => window.removeEventListener("click", swallow, true), 60);
	}

	const onKey = (e: KeyboardEvent) => {
		if (e.key === "Escape" && drag) {
			e.preventDefault();
			e.stopPropagation();
			endPress();
			endDrag(false);
		}
	};
	const onScroll = () => {
		if (drag) requestFrame();
	};
	const onBlur = () => {
		if (!drag && !press) return;
		const hadDrag = !!drag;
		endPress();
		if (hadDrag) endDrag(false);
	};

	list.addEventListener("pointerdown", onPointerDown);
	// Block page scrolling on touch once a long-press has picked up a row.
	list.addEventListener(
		"touchmove",
		(e) => {
			if (drag) e.preventDefault();
		},
		{ passive: false },
	);
	list.addEventListener("contextmenu", (e) => {
		if (drag || press?.touch) e.preventDefault();
	});
	list.addEventListener("dragstart", (e) => e.preventDefault());
	window.addEventListener("keydown", onKey, true);
	window.addEventListener("scroll", onScroll, true);
	window.addEventListener("blur", onBlur);

	// Runs only when the widget re-renders or unloads (never mid-drag: drags hold the widget).
	opts.register(() => {
		endPress();
		if (raf) window.cancelAnimationFrame(raf);
		raf = 0;
		drag = null;
		window.removeEventListener("keydown", onKey, true);
		window.removeEventListener("scroll", onScroll, true);
		window.removeEventListener("blur", onBlur);
		document.body.removeClass(BODY_DRAG_CLASS);
	});
}
