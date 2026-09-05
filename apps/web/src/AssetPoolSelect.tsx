import { useEffect, useId, useRef, useState } from "react";

type AssetChoice = {
  id: string;
  name: string;
  symbol: string;
};

function tokenIconSrc(id: string): string {
  if (id === "eth" || id === "weth") return "/tokens/eth.svg";
  if (id === "dai") return "/tokens/dai.svg";
  if (id === "lusd") return "/tokens/lusd.png";
  return "";
}

function TokenMark(props: { option: AssetChoice }) {
  const src = tokenIconSrc(props.option.id);
  if (src) {
    return (
      <img
        className="asset-select-icon"
        src={src}
        alt=""
        width={28}
        height={28}
        draggable={false}
      />
    );
  }
  return (
    <span className="asset-select-icon asset-select-icon-fallback" aria-hidden>
      {props.option.symbol.slice(0, 1)}
    </span>
  );
}

function AssetRow(props: { option: AssetChoice }) {
  return (
    <>
      <TokenMark option={props.option} />
      <span className="asset-select-copy">
        <span className="asset-select-name">{props.option.name}</span>
        <span className="asset-select-ticker">({props.option.symbol})</span>
      </span>
    </>
  );
}

type Props = {
  id: string;
  options: AssetChoice[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
};

export function AssetPoolSelect(props: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected =
    props.options.find((p) => p.id === props.value) ?? props.options[0] ?? null;

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

  if (props.options.length === 0) {
    return (
      <button type="button" id={props.id} className="asset-select-trigger" disabled>
        No pool configured
      </button>
    );
  }

  return (
    <div className={`asset-select ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        id={props.id}
        className="asset-select-trigger"
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? <AssetRow option={selected} /> : "Select asset"}
        <span className="asset-select-caret" aria-hidden />
      </button>
      {open ? (
        <ul id={listId} className="asset-select-menu" role="listbox">
          {props.options.map((p) => {
            const active = p.id === selected?.id;
            return (
              <li key={p.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`asset-select-option ${active ? "is-active" : ""}`}
                  onClick={() => {
                    props.onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <AssetRow option={p} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
