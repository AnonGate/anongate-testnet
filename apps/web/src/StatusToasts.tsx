import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ToastKind = "ok" | "err";
type ToastItem = { id: number; kind: ToastKind; text: string };

const DISMISS_MS: Record<ToastKind, number> = {
  ok: 4500,
  err: 8000,
};

export function StatusToasts(props: {
  kind: "idle" | "ok" | "err";
  text: string;
  nonce: number;
  busy: boolean;
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, number>());
  const lastNonce = useRef(0);

  function dismiss(id: number) {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => list.filter((item) => item.id !== id));
  }

  useEffect(() => {
    if (props.kind !== "ok" && props.kind !== "err") return;
    const text = props.text.trim();
    if (!text || props.nonce === 0) return;
    if (lastNonce.current === props.nonce) return;
    lastNonce.current = props.nonce;
    const id = ++idRef.current;
    const kind = props.kind;
    setToasts((list) => [...list, { id, kind, text }].slice(-3));
    const timer = window.setTimeout(() => dismiss(id), DISMISS_MS[kind]);
    timers.current.set(id, timer);
  }, [props.kind, props.text, props.nonce]);

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
    };
  }, []);

  const showBusy = props.busy && toasts.length === 0;

  if (!showBusy && toasts.length === 0) return null;

  return createPortal(
    <div className="status-toasts" aria-live="polite" aria-relevant="additions">
      {showBusy ? (
        <div className="status-toast is-busy" role="status">
          <span className="status-toast-mark" aria-hidden />
          <span className="status-toast-text">Working…</span>
        </div>
      ) : null}
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`status-toast is-${item.kind}`}
          role={item.kind === "err" ? "alert" : "status"}
        >
          <span className="status-toast-mark" aria-hidden />
          <span className="status-toast-text">{item.text}</span>
          <button
            type="button"
            className="status-toast-close"
            onClick={() => dismiss(item.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
