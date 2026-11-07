import { fmtNum } from "@/lib/quote";

// DWC (double wall corrugated) pipe end view: corrugated outer ring, smooth inner wall, labelled with the
// nominal inside diameter (DN), the outside diameter when known, and the ring stiffness class.
// Same size as PipeSection so quote rows line up.
export function DwcSection({
  dn,
  od,
  cls,
}: {
  dn: number;
  od?: number | null;
  cls?: string | null;
}) {
  const cx = 24;
  const cy = 34;
  const R = 20; // tips of the corrugation
  const r = 13.5; // inner wall
  const teeth = 24;
  const outline = Array.from({ length: teeth * 2 }, (_, i) => {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rad = i % 2 ? R - 3 : R;
    return `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  const line = "var(--qd-accent, #0b4f7c)";
  const ink = "var(--qd-ink, #1e293b)";
  const muted = "var(--qd-muted, #64748b)";
  const LX = 56;
  const label = `DWC pipe: DN ${fmtNum(dn)}${od ? `, OD ${fmtNum(od)} mm` : ""}${cls ? `, ${cls}` : ""}`;
  return (
    <svg
      viewBox="0 0 180 60"
      role="img"
      aria-label={label}
      className="h-[12.5mm] w-[37.5mm] shrink-0 overflow-visible"
      fontSize="9.5"
    >
      <polygon points={outline} fill="#1e293b" />
      <circle cx={cx} cy={cy} r={r + 1.6} fill="#334155" />
      <circle cx={cx} cy={cy} r={r} fill="#f1f5f9" />
      <g stroke="#38bdf8" strokeWidth="0.9" fill="none">
        <line x1={cx - r} y1={cy} x2={LX - 4} y2={cy} />
        <line x1={cx - r} y1={cy - 3} x2={cx - r} y2={cy + 3} />
        <line x1={cx + r} y1={cy - 3} x2={cx + r} y2={cy + 3} />
      </g>
      <g stroke={line} strokeWidth="0.9" fill="none">
        <line x1={cx - R} y1="9" x2={LX - 4} y2="9" />
        <line x1={cx - R} y1="5.5" x2={cx - R} y2="12.5" />
        <line x1={cx + R} y1="5.5" x2={cx + R} y2="12.5" />
      </g>
      <text x={LX} y={12}>
        <tspan fill={muted}>OD </tspan>
        <tspan fill={ink} fontWeight="600">
          {od ? `${fmtNum(od)} mm` : "—"}
        </tspan>
      </text>
      <text x={LX} y={cy + 3.5}>
        <tspan fill={muted}>ID (DN) </tspan>
        <tspan fill={ink} fontWeight="600">
          {fmtNum(dn)} mm
        </tspan>
      </text>
      {cls && (
        <text x={LX} y={55}>
          <tspan fill={muted}>Stiffness </tspan>
          <tspan fill={ink} fontWeight="600">
            {cls}
          </tspan>
        </text>
      )}
    </svg>
  );
}
