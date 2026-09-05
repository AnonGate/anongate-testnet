import { useEffect, useRef, type ReactNode } from "react";

type GlyphKind =
  | "shield"
  | "eyeoff"
  | "lock"
  | "proof"
  | "note"
  | "root"
  | "nullifier"
  | "mix"
  | "commit"
  | "key";

interface Spec {
  kind: GlyphKind;
  label: string;
  hint: string;
  x: number;
  y: number;
  s: number;
  d: number;
  ax: number;
  ay: number;
  wx: number;
  wy: number;
  ph: number;
  color: string;
}

/* Left and right fields, behind the protocol deck — same idea as AnonSwap coins. */
const SPECS: Spec[] = [
  { kind: "shield", label: "Shielded pool", hint: "Shared Merkle set", x: 4, y: 10, s: 84, d: 0.9, ax: 30, ay: 24, wx: 0.2, wy: 0.15, ph: 0.0, color: "#21c95e" },
  { kind: "eyeoff", label: "Unlinkable", hint: "Deposit ≠ withdraw", x: 11, y: 34, s: 58, d: 0.6, ax: 24, ay: 30, wx: 0.16, wy: 0.22, ph: 1.4, color: "#4ade80" },
  { kind: "lock", label: "Non-custodial", hint: "You hold the note", x: 3, y: 56, s: 96, d: 1.0, ax: 28, ay: 36, wx: 0.13, wy: 0.18, ph: 2.6, color: "#21c95e" },
  { kind: "proof", label: "ZK proof", hint: "Groth16 in-tab", x: 12, y: 76, s: 50, d: 0.5, ax: 32, ay: 22, wx: 0.24, wy: 0.14, ph: 4.0, color: "#4c82fb" },
  { kind: "note", label: "Private note", hint: "Never stored here", x: 7, y: 90, s: 44, d: 0.4, ax: 22, ay: 18, wx: 0.27, wy: 0.17, ph: 0.9, color: "#9b9b9b" },
  { kind: "root", label: "Merkle root", hint: "On-chain commitment", x: 88, y: 8, s: 90, d: 1.0, ax: 30, ay: 32, wx: 0.15, wy: 0.2, ph: 3.2, color: "#21c95e" },
  { kind: "nullifier", label: "Nullifier", hint: "Spend once", x: 92, y: 32, s: 56, d: 0.65, ax: 24, ay: 28, wx: 0.19, wy: 0.15, ph: 1.1, color: "#4c82fb" },
  { kind: "mix", label: "Anonymity set", hint: "One among many", x: 85, y: 56, s: 74, d: 0.85, ax: 32, ay: 26, wx: 0.14, wy: 0.23, ph: 4.7, color: "#4ade80" },
  { kind: "commit", label: "Commitment", hint: "Poseidon hash", x: 90, y: 76, s: 48, d: 0.5, ax: 24, ay: 28, wx: 0.25, wy: 0.16, ph: 2.1, color: "#9b9b9b" },
  { kind: "key", label: "Recovery Code", hint: "The note is the key", x: 93, y: 90, s: 62, d: 0.7, ax: 26, ay: 22, wx: 0.17, wy: 0.21, ph: 5.8, color: "#21c95e" },
];

const FOCUS_RADIUS = 240;
const MAX_BLUR = 16;
const AUTO_PERIOD = 3.8;

function Glyph({ kind }: { kind: GlyphKind }) {
  const common = {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const icons: Record<GlyphKind, ReactNode> = {
    shield: (
      <path d="M12 3 5 6.2v5.3c0 4.2 2.9 7.3 7 8.5 4.1-1.2 7-4.3 7-8.5V6.2L12 3Z" {...common} />
    ),
    eyeoff: (
      <>
        <path d="M3.2 3.2l17.6 17.6" {...common} />
        <path d="M9.9 9.9A3.1 3.1 0 0 0 12 15.2a3.1 3.1 0 0 0 3-2.4" {...common} />
        <path d="M6.2 6.4C4.4 7.6 3 9.4 2.2 12c1.6 4.8 5.3 7.8 9.8 7.8 1.6 0 3.2-.4 4.6-1.1" {...common} />
        <path d="M17.8 15.6c1.6-1.2 2.8-2.8 3.9-3.6C20.1 7 16.4 4.2 12 4.2c-1 0-2 .2-2.9.5" {...common} />
      </>
    ),
    lock: (
      <>
        <rect x="5.5" y="11" width="13" height="9.5" rx="2" {...common} />
        <path d="M8.2 11V8.2a3.8 3.8 0 0 1 7.6 0V11" {...common} />
      </>
    ),
    proof: (
      <>
        <rect x="4.4" y="4.4" width="15.2" height="15.2" rx="3.4" {...common} />
        <path d="M8.1 12.2 10.7 14.8 16.1 9.2" {...common} />
      </>
    ),
    note: (
      <>
        <path d="M7 4.5h7.2L19 9.2V19.5H7V4.5Z" {...common} />
        <path d="M14.2 4.5V9.2H19" {...common} />
        <path d="M9.5 13h5M9.5 16h3.4" {...common} />
      </>
    ),
    root: (
      <>
        <circle cx="12" cy="5.2" r="1.7" {...common} />
        <circle cx="6.2" cy="12.2" r="1.55" {...common} />
        <circle cx="17.8" cy="12.2" r="1.55" {...common} />
        <circle cx="4.4" cy="18.6" r="1.3" {...common} />
        <circle cx="9.2" cy="18.6" r="1.3" {...common} />
        <circle cx="14.8" cy="18.6" r="1.3" {...common} />
        <circle cx="19.6" cy="18.6" r="1.3" {...common} />
        <path d="M12 6.9v3.4M12 10.3 6.2 12.2M12 10.3l5.8 1.9M6.2 13.8 4.4 17.3M6.2 13.8l3 3.5M17.8 13.8l-3 3.5M17.8 13.8 19.6 17.3" {...common} />
      </>
    ),
    nullifier: (
      <>
        <circle cx="12" cy="12" r="8" {...common} />
        <path d="M8 8l8 8M16 8l-8 8" {...common} />
      </>
    ),
    mix: (
      <>
        <circle cx="9.2" cy="12" r="5.2" {...common} />
        <circle cx="14.8" cy="12" r="5.2" {...common} />
      </>
    ),
    commit: (
      <>
        <path d="M8.2 6.5 4.8 12l3.4 5.5M15.8 6.5 19.2 12l-3.4 5.5" {...common} />
        <path d="M13.2 5.5 10.8 18.5" {...common} />
      </>
    ),
    key: (
      <>
        <circle cx="8.4" cy="12" r="3.4" {...common} />
        <path d="M11.6 12H20v2.4h-2.2V12 16.2" {...common} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {icons[kind]}
    </svg>
  );
}

export function PrivacyField() {
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const discRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ringRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lensRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    if (reduced) {
      discRefs.current.forEach((el) => {
        if (!el) return;
        el.style.filter = `blur(${MAX_BLUR / 2}px)`;
        el.style.opacity = "0.55";
      });
      return;
    }

    let raf = 0;
    const mouse = { x: -9999, y: -9999, inside: false };
    const par = { x: 0, y: 0 };
    const parTarget = { x: 0, y: 0 };
    const focus = SPECS.map(() => 0);
    let autoIdx = Math.floor(Math.random() * SPECS.length);
    let autoStart = performance.now() / 1000;

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.inside = true;
      parTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
      parTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onLeave = () => {
      mouse.inside = false;
    };

    const tick = () => {
      const now = performance.now() / 1000;
      const root = rootRef.current;
      if (!root) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const rect = root.getBoundingClientRect();

      par.x += (parTarget.x - par.x) * 0.05;
      par.y += (parTarget.y - par.y) * 0.05;

      if (now - autoStart > AUTO_PERIOD) {
        let next = Math.floor(Math.random() * SPECS.length);
        if (next === autoIdx) next = (next + 3) % SPECS.length;
        autoIdx = next;
        autoStart = now;
      }
      const autoPhase = (now - autoStart) / AUTO_PERIOD;
      const autoVal = Math.pow(Math.sin(Math.min(autoPhase, 1) * Math.PI), 2);

      const graph = graphRef.current;
      if (graph) {
        const gx = par.x * 10;
        const gy = par.y * 6;
        graph.style.transform = `translate3d(${gx.toFixed(2)}px, ${gy.toFixed(2)}px, 0)`;
      }

      const deck = root.parentElement?.querySelector(".stage-deck");
      const deckRect = deck?.getBoundingClientRect();

      SPECS.forEach((c, i) => {
        const wrap = wrapRefs.current[i];
        const disc = discRefs.current[i];
        if (!wrap || !disc) return;

        const dx = c.ax * Math.sin(now * c.wx + c.ph);
        const dy = c.ay * Math.cos(now * c.wy + c.ph * 1.7);
        const rot = 7 * Math.sin(now * 0.12 + c.ph);
        const px = -par.x * 26 * c.d;
        const py = -par.y * 16 * c.d;
        wrap.style.transform = `translate3d(${(dx + px).toFixed(2)}px, ${(dy + py).toFixed(2)}px, 0)`;

        let target = 0;
        if (!coarse && mouse.inside) {
          const cx = rect.left + (rect.width * c.x) / 100 + dx + px + c.s / 2;
          const cy = rect.top + (rect.height * c.y) / 100 + dy + py + c.s / 2;
          const dist = Math.hypot(mouse.x - cx, mouse.y - cy);
          const plateau = c.s * 0.75;
          target = Math.max(0, 1 - Math.max(0, dist - plateau) / FOCUS_RADIUS);
          target = target * target * (3 - 2 * target);
        }
        if (i === autoIdx) target = Math.max(target, autoVal * 0.9);

        focus[i] += (target - focus[i]) * 0.09;
        const f = focus[i];

        disc.style.filter = `blur(${((1 - f) * MAX_BLUR).toFixed(2)}px) saturate(${(1.25 - f * 0.2).toFixed(2)})`;
        disc.style.opacity = (0.42 + f * 0.58).toFixed(3);
        disc.style.transform = `scale(${(0.9 + f * 0.2).toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;

        const vis = Math.max(0, (f - 0.3) / 0.7);
        const ring = ringRefs.current[i];
        if (ring) {
          ring.style.opacity = vis.toFixed(3);
          ring.style.transform = `translate(-50%, -50%) scale(${(0.82 + vis * 0.18).toFixed(3)}) rotate(${(rot * 0.45).toFixed(2)}deg)`;
        }
        const label = labelRefs.current[i];
        if (label) {
          const towardCenter = c.x < 50 ? 1 : -1;
          const slide = (1 - vis) * 10 * towardCenter;
          const wr = wrap.getBoundingClientRect();
          const labelW = 150;
          const labelH = 44;
          const labelLeft = c.x < 50 ? wr.right + 12 : wr.left - 12 - labelW;
          const hitsDeck =
            !!deckRect &&
            labelLeft + labelW > deckRect.left &&
            labelLeft < deckRect.right &&
            wr.top + labelH > deckRect.top &&
            wr.top < deckRect.bottom;
          label.style.opacity = hitsDeck ? "0" : vis.toFixed(3);
          label.style.transform = `translateY(-50%) translateX(${slide.toFixed(2)}px)`;
        }
      });

      const lens = lensRef.current;
      if (lens) {
        if (!coarse && mouse.inside) {
          lens.style.opacity = "1";
          lens.style.transform = `translate(${mouse.x - rect.left - 190}px, ${mouse.y - rect.top - 190}px)`;
        } else {
          lens.style.opacity = "0";
        }
      }

      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={rootRef} className="privacy-field" aria-hidden>
      <svg
        ref={graphRef}
        className="privacy-graph"
        viewBox="0 0 1200 700"
        preserveAspectRatio="xMidYMid slice"
      >
        <g fill="none" stroke="rgba(33,201,94,0.16)" strokeWidth="1.1">
          <path d="M600 70 L340 220 L180 390 L90 560" />
          <path d="M340 220 L420 390 L300 560" />
          <path d="M600 70 L860 220 L1020 390 L1110 560" />
          <path d="M860 220 L780 390 L900 560" />
          <path d="M600 70 L600 250 L480 430 L720 430 L600 250" />
          <path d="M480 430 L360 560" />
          <path d="M480 430 L540 560" />
          <path d="M720 430 L660 560" />
          <path d="M720 430 L840 560" />
        </g>
        {[
          [600, 70, 11],
          [340, 220, 8],
          [860, 220, 8],
          [180, 390, 7],
          [420, 390, 7],
          [600, 250, 9],
          [780, 390, 7],
          [1020, 390, 7],
          [90, 560, 6],
          [300, 560, 6],
          [360, 560, 6],
          [540, 560, 6],
          [660, 560, 6],
          [840, 560, 6],
          [900, 560, 6],
          [1110, 560, 6],
        ].map(([cx, cy, r], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill={i === 0 ? "rgba(33,201,94,0.28)" : "rgba(33,201,94,0.12)"}
            stroke="rgba(33,201,94,0.32)"
            strokeWidth="1"
          />
        ))}
      </svg>

      {SPECS.map((c, i) => {
        const towardCenter = c.x < 50;
        return (
          <div
            key={c.kind}
            ref={(el) => {
              wrapRefs.current[i] = el;
            }}
            className="privacy-orb"
            style={{
              insetInlineStart: `${c.x}%`,
              top: `${c.y}%`,
              width: c.s,
              height: c.s,
              color: c.color,
            }}
          >
            <div
              ref={(el) => {
                ringRefs.current[i] = el;
              }}
              className="privacy-orb-rings"
            >
              <span style={{ inset: "19%", borderColor: `${c.color}8c` }} />
              <span style={{ inset: "9%", borderColor: `${c.color}4d` }} />
              <span style={{ inset: 0, borderColor: `${c.color}24` }} />
            </div>

            <div
              ref={(el) => {
                discRefs.current[i] = el;
              }}
              className="privacy-orb-disc"
              style={{
                boxShadow: `0 0 28px ${c.color}22, inset 0 0 0 1px ${c.color}33`,
              }}
            >
              <Glyph kind={c.kind} />
            </div>

            <div
              ref={(el) => {
                labelRefs.current[i] = el;
              }}
              className={`privacy-orb-label${towardCenter ? "" : " is-left"}`}
              style={{ color: c.color }}
            >
              <strong>{c.label}</strong>
              <span>{c.hint}</span>
            </div>
          </div>
        );
      })}

      <div className="privacy-sheen" />
      <div ref={lensRef} className="privacy-lens" />
    </div>
  );
}
