import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { HelpKey } from "./helpCopy";
import { HELP } from "./helpCopy";

type HelpTipProps = {
  tipKey?: HelpKey;
  text?: string;
  /** Accessible name for the trigger */
  label?: string;
};

type Place = {
  top: number;
  left: number;
  width: number;
  arrowX: number;
  side: "above" | "below";
};

const GAP = 12;
const PAD = 14;
const MAX_W = 340;

function useFineHover(): boolean {
  const [fine, setFine] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const on = () => setFine(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return fine;
}

function computePlace(trigger: DOMRect, panelH: number): Place {
  const width = Math.min(MAX_W, Math.max(200, window.innerWidth - PAD * 2));
  const height = panelH || 140;
  const need = height + GAP + PAD;
  const canBelow = window.innerHeight - trigger.bottom >= need;
  const canAbove = trigger.top >= need;
  const side: Place["side"] = canBelow || !canAbove ? "below" : "above";
  let top = side === "below" ? trigger.bottom + GAP : trigger.top - GAP - height;
  top = Math.max(PAD, Math.min(top, window.innerHeight - PAD - height));
  let left = trigger.left + trigger.width / 2 - width / 2;
  left = Math.max(PAD, Math.min(left, window.innerWidth - PAD - width));
  let arrowX = trigger.left + trigger.width / 2 - left;
  arrowX = Math.max(16, Math.min(arrowX, width - 16));
  return { top, left, width, arrowX, side };
}

/**
 * “!” mark: hover on desktop, tap on phone. Panel is portaled so parents never clip it.
 * On touch, it opens as a bottom sheet so the text is readable.
 */
export function HelpTip(props: HelpTipProps) {
  const text = props.text ?? (props.tipKey ? HELP[props.tipKey] : "");
  const fineHover = useFineHover();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const panelId = useId();
  const aria = props.label ?? "More information";
  const sheet = !fineHover;

  const cancelClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    if (!fineHover) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  };

  const updatePlace = () => {
    if (sheet) return;
    const el = rootRef.current;
    if (!el) return;
    const h = panelRef.current?.offsetHeight ?? 0;
    setPlace(computePlace(el.getBoundingClientRect(), h));
  };

  useLayoutEffect(() => {
    if (!open || sheet) {
      if (!open) setPlace(null);
      return;
    }
    updatePlace();
    const frame = window.requestAnimationFrame(() => updatePlace());
    const onWin = () => updatePlace();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, text, sheet]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (sheet) return;
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, sheet]);

  useEffect(() => {
    if (!open || !sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, sheet]);

  useEffect(() => () => cancelClose(), []);

  if (!text) return null;

  const panelStyle: CSSProperties | undefined =
    !sheet && place
      ? {
          top: place.top,
          left: place.left,
          width: place.width,
          ["--arrow-x" as string]: `${place.arrowX}px`,
        }
      : undefined;

  const inner = (
    <>
      <span className="help-tip-kicker">What is this?</span>
      <span className="help-tip-body">{text}</span>
    </>
  );

  const panel = open
    ? sheet
      ? (
          <div className="help-tip-layer" role="presentation">
            <button
              type="button"
              className="help-tip-scrim"
              aria-label="Close help"
              onClick={() => setOpen(false)}
            />
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={aria}
              className="help-tip-sheet"
            >
              <span className="help-tip-sheet-handle" aria-hidden />
              {inner}
              <button type="button" className="help-tip-sheet-close" onClick={() => setOpen(false)}>
                Got it
              </button>
            </div>
          </div>
        )
      : (
          <div
            ref={panelRef}
            id={panelId}
            role="tooltip"
            className={`help-tip-panel ${place?.side === "above" ? "is-above" : "is-below"}${place ? " is-ready" : ""}`}
            style={panelStyle}
            onMouseEnter={() => {
              cancelClose();
              setOpen(true);
            }}
            onMouseLeave={scheduleClose}
          >
            {inner}
          </div>
        )
    : null;

  return (
    <span
      className={`help-tip ${open ? "open" : ""}`}
      ref={rootRef}
      onMouseEnter={() => {
        if (!fineHover) return;
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="help-tip-mark"
        aria-label={aria}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          cancelClose();
          setOpen((v) => !v);
        }}
      >
        <span aria-hidden>!</span>
      </button>
      {panel && typeof document !== "undefined" ? createPortal(panel, document.body) : null}
    </span>
  );
}

/** Label row with inline help mark */
export function LabelWithHelp(props: {
  htmlFor?: string;
  children: ReactNode;
  tipKey?: HelpKey;
  text?: string;
  extra?: ReactNode;
}) {
  return (
    <label htmlFor={props.htmlFor} className="label-with-help">
      <span className="label-with-help-text">
        {props.children}
        <HelpTip tipKey={props.tipKey} text={props.text} />
      </span>
      {props.extra}
    </label>
  );
}

