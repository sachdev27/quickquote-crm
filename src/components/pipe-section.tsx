import type { PipeSpec } from "@/lib/pipe-spec";
import { fmtNum } from "@/lib/quote";

// Pipe cross-section: a ring sized by OD (log scale, 16–160 mm) with an OD dimension line above.
export function PipeSection({ spec, size = 52 }: { spec: PipeSpec; size?: number }) {
  const t = Math.min(1, Math.max(0, Math.log(spec.od / 16) / Math.log(10)));
  const R = 11 + 9 * t;
  const cx = 26;
  const cy = 30;
  // Wall exaggerated ~2.5× (clamped) so it reads like a product photo, while thicker walls still look thicker.
  const ratio = spec.wall ? (2 * spec.wall) / spec.od : 0.12;
  const wallPx = R * Math.min(0.42, Math.max(0.2, ratio * 2.5));
  const r = R - wallPx;
  const ring = `M${cx - R},${cy}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0Z M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
  const label = `Pipe cross-section, OD ${fmtNum(spec.od)} mm${spec.wall ? `, wall ${fmtNum(spec.wall, 1)} mm` : ""}`;
  return (
    <svg
      viewBox="0 0 52 52"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      {/* OD dimension line */}
      <g stroke="var(--qd-accent)" strokeWidth="0.8" fill="none">
        <line x1={cx - R} y1="4" x2={cx + R} y2="4" />
        <line x1={cx - R} y1="1.5" x2={cx - R} y2="6.5" />
        <line x1={cx + R} y1="1.5" x2={cx + R} y2="6.5" />
        <line x1={cx - R} y1="6.5" x2={cx - R} y2={cy} strokeDasharray="1.4 1.4" opacity="0.6" />
        <line x1={cx + R} y1="6.5" x2={cx + R} y2={cy} strokeDasharray="1.4 1.4" opacity="0.6" />
      </g>
      {/* Bore shading, then the wall */}
      <circle cx={cx} cy={cy} r={r} fill="#f1f5f9" />
      <path d={ring} fill="#1e293b" fillRule="evenodd" />
      {/* Wall-thickness marker across the ring on the right */}
      <line
        x1={cx + r}
        y1={cy}
        x2={cx + R}
        y2={cy}
        stroke="var(--qd-accent-mark, #38bdf8)"
        strokeWidth="1.4"
      />
      <circle
        cx={cx}
        cy={cy}
        r={R - wallPx / 2}
        fill="none"
        stroke="#64748b"
        strokeWidth="0.35"
        opacity="0.7"
      />
    </svg>
  );
}
