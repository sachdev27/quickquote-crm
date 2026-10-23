import type { PipeSpec } from "@/lib/pipe-spec";
import { fmtNum } from "@/lib/quote";

// Pipe cross-section drawn as inline SVG (sharp at any zoom or print size), with the three dimensions
// written on it: OD (dimension line over the top), ID (line across the bore) and thickness (leader into
// the wall). Ring size follows OD on a log scale; the wall is exaggerated so thickness is visible.
export function PipeSection({ spec }: { spec: PipeSpec }) {
  const t = Math.min(1, Math.max(0, Math.log(spec.od / 16) / Math.log(10)));
  const R = 13 + 7 * t;
  const cx = 24;
  const cy = 37;
  const ratio = spec.wall ? (2 * spec.wall) / spec.od : 0.12;
  const wallPx = R * Math.min(0.42, Math.max(0.2, ratio * 2.5));
  const r = R - wallPx;
  const ring = `M${cx - R},${cy}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0Z M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
  // thickness leader starts in the middle of the wall at 45° (lower right)
  const pm = R - wallPx / 2;
  const px = cx + pm * Math.SQRT1_2;
  const py = cy + pm * Math.SQRT1_2;
  const LX = 56; // labels start here
  const hasWall = !!spec.wall && !!spec.id;
  const wallText = spec.wall
    ? `${fmtNum(spec.wall, 1)}${spec.wallMax ? `–${fmtNum(spec.wallMax, 1)}` : ""} mm`
    : "";
  const label = `Pipe cross-section: OD ${fmtNum(spec.od)} mm${hasWall ? `, ID ${fmtNum(spec.id!, 1)} mm, thickness ${wallText}` : ""}`;
  const line = "var(--qd-accent, #0b4f7c)";
  const ink = "var(--qd-ink, #1e293b)";
  const muted = "var(--qd-muted, #64748b)";
  return (
    <svg
      viewBox="0 0 152 60"
      role="img"
      aria-label={label}
      className="h-[12.5mm] w-[31.7mm] shrink-0"
      fontSize="9.5"
    >
      {/* bore + wall */}
      <circle cx={cx} cy={cy} r={r} fill="#f1f5f9" />
      <path d={ring} fill="#1e293b" fillRule="evenodd" />

      {/* OD: dimension line over the top, extended to its label */}
      <g stroke={line} strokeWidth="0.9" fill="none">
        <line x1={cx - R} y1="9" x2={LX - 4} y2="9" />
        <line x1={cx - R} y1="5.5" x2={cx - R} y2="12.5" />
        <line x1={cx + R} y1="5.5" x2={cx + R} y2="12.5" />
        <line x1={cx - R} y1="12.5" x2={cx - R} y2={cy} strokeDasharray="1.6 1.6" opacity="0.5" />
        <line x1={cx + R} y1="12.5" x2={cx + R} y2={cy} strokeDasharray="1.6 1.6" opacity="0.5" />
      </g>
      <Label x={LX} y={12} tag="OD" value={`${fmtNum(spec.od)} mm`} ink={ink} muted={muted} />

      {hasWall && (
        <>
          {/* ID: line across the bore, extended to its label */}
          <g stroke="#38bdf8" strokeWidth="0.9" fill="none">
            <line x1={cx - r} y1={cy} x2={LX - 4} y2={cy} />
            <line x1={cx - r} y1={cy - 3} x2={cx - r} y2={cy + 3} />
            <line x1={cx + r} y1={cy - 3} x2={cx + r} y2={cy + 3} />
          </g>
          <Label
            x={LX}
            y={cy + 3.5}
            tag="ID"
            value={`${fmtNum(spec.id!, 1)} mm`}
            ink={ink}
            muted={muted}
          />

          {/* thickness: leader from the wall to its label */}
          <g stroke="#f97316" strokeWidth="0.9" fill="none">
            <line x1={px} y1={py} x2={LX - 4} y2={py} />
          </g>
          <circle cx={px} cy={py} r="1.6" fill="#f97316" />
          <Label x={LX} y={py + 3.5} tag="Thickness" value={wallText} ink={ink} muted={muted} />
        </>
      )}
    </svg>
  );
}

function Label({
  x,
  y,
  tag,
  value,
  ink,
  muted,
}: {
  x: number;
  y: number;
  tag: string;
  value: string;
  ink: string;
  muted: string;
}) {
  return (
    <text x={x} y={y}>
      <tspan fill={muted}>{tag} </tspan>
      <tspan fill={ink} fontWeight="600">
        {value}
      </tspan>
    </text>
  );
}
