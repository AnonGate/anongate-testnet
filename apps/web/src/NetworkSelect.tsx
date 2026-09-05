import { useEffect, useId, useRef, useState } from "react";
import {
  PRODUCT_NETWORKS,
  type ProductNetworkId,
} from "./networkConfig";

type Props = {
  id: string;
  value: ProductNetworkId;
  onChange: (id: ProductNetworkId) => void;
  disabled?: boolean;
};

function NetworkRow(props: {
  option: (typeof PRODUCT_NETWORKS)[number];
  compact?: boolean;
}) {
  const { option, compact } = props;
  return (
    <>
      <img
        className="asset-select-icon net-select-icon"
        src="/tokens/eth.svg"
        alt=""
        width={22}
        height={22}
        draggable={false}
      />
      <span className="asset-select-copy net-select-copy">
        <span className="asset-select-name">{option.name}</span>
        <span className="asset-select-ticker">
          {option.shortLabel}
          {compact ? null : ` · ${option.status}`}
        </span>
      </span>
      <span className={`net-select-badge${option.live ? " is-live" : ""}`}>
        {option.status}
      </span>
    </>
  );
}

export function NetworkSelect(props: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected =
    PRODUCT_NETWORKS.find((n) => n.id === props.value) ?? PRODUCT_NETWORKS[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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
  }, [open]);

  return (
    <div
      className={`asset-select net-select${open ? " is-open" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        id={props.id}
        className="asset-select-trigger net-select-trigger"
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Network"
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? <NetworkRow option={selected} compact /> : "Network"}
        <span className="asset-select-caret" aria-hidden />
      </button>
      {open ? (
        <ul id={listId} className="asset-select-menu net-select-menu" role="listbox">
          {PRODUCT_NETWORKS.map((n) => {
            const active = n.id === selected?.id;
            return (
              <li key={n.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-disabled={!n.live}
                  className={`asset-select-option${active ? " is-active" : ""}${
                    n.live ? "" : " is-soon"
                  }`}
                  onClick={() => {
                    props.onChange(n.id);
                    setOpen(false);
                  }}
                >
                  <NetworkRow option={n} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
