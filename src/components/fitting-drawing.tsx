import type { ReactNode } from "react";

// Fitting drawn as inline SVG next to its quote line, the same size as the pipe cross-section so the
// column lines up. The shape comes from the fitting's name (coupler, elbow, tee, reducer, flange…); the
// size is written beside it. Pipes are drawn hollow: a dark wall with the bore showing through.

type Kind =
  | "coupler"
  | "elbow90"
  | "elbow45"
  | "tee"
  | "redtee"
  | "cross"
  | "ywye"
  | "cap"
  | "reducer"
  | "saddle"
  | "slipflange"
  | "blindflange"
  | "stubend"
  | "tail"
  | "tailflange";

// order matters: the more specific names first ("Reducing tee" before "Reducer" and "Tee")
const KINDS: [RegExp, Kind][] = [
  [/reducing\s*tee/i, "redtee"],
  [/taping\s*tee|tapping\s*tee|saddle/i, "saddle"],
  [/reducer/i, "reducer"],
  [/elbow\s*45|45\s*°?\s*bend/i, "elbow45"],
  [/elbow|bend/i, "elbow90"],
  [/4[\s-]*way|cross/i, "cross"],
  [/y[\s-]*way|\bwye\b/i, "ywye"],
  [/\btee\b/i, "tee"],
  [/end\s*cap|\bcap\b/i, "cap"],
  [/blind\s*flange/i, "blindflange"],
  [/tail\s*piece\s*with\s*flange/i, "tailflange"],
  [/tail\s*piece/i, "tail"],
  [/flange/i, "slipflange"],
  [/pipe\s*end|stub\s*end|l\.?\s*n\b/i, "stubend"],
  [/coupl|socket|sleeve/i, "coupler"],
];

export const fittingKind = (description: string): Kind | null =>
  KINDS.find(([re]) => re.test(description))?.[1] ?? null;

const WALL = "#1e293b";
const BORE = "#f1f5f9";

// pipe runs along paths (dark wall, light bore) plus solid parts on top; all walls are drawn before
// any bore so the bores of a tee or cross join up
type Drawing = { runs: [string, number][]; extra: ReactNode };

function shape(kind: Kind): Drawing {
  switch (kind) {
    case "coupler":
      return {
        runs: [["M4,32 H44", 7]],
        extra: (
          <>
            <rect x="12" y="24" width="24" height="16" rx="2" fill={WALL} />
            <line x1="24" y1="24" x2="24" y2="40" stroke={BORE} strokeWidth="1" />
          </>
        ),
      };
    case "elbow90":
      return { runs: [["M6,14 V40 Q6,48 14,48 H44", 9]], extra: null };
    case "elbow45":
      return { runs: [["M4,50 H20 L42,18", 9]], extra: null };
    case "tee":
      return {
        runs: [
          ["M4,42 H44", 9],
          ["M24,42 V10", 9],
        ],
        extra: null,
      };
    case "redtee":
      return {
        runs: [
          ["M4,42 H44", 10],
          ["M24,42 V12", 6],
        ],
        extra: null,
      };
    case "cross":
      return {
        runs: [
          ["M4,32 H44", 9],
          ["M24,8 V56", 9],
        ],
        extra: null,
      };
    case "ywye":
      return {
        runs: [
          ["M24,56 V34 L8,10", 9],
          ["M24,34 L40,10", 9],
        ],
        extra: null,
      };
    case "cap":
      return {
        runs: [["M4,32 H26", 9]],
        extra: (
          <>
            <path d="M26,23 H34 Q44,23 44,32 Q44,41 34,41 H26 Z" fill={WALL} />
          </>
        ),
      };
    case "reducer":
      return {
        runs: [
          ["M4,32 H14", 14],
          ["M34,32 H44", 6],
        ],
        extra: (
          <>
            <path d="M14,25 L34,29 V35 L14,39 Z" fill={WALL} />
          </>
        ),
      };
    case "saddle":
      return {
        runs: [
          ["M4,44 H44", 10],
          ["M24,33 V10", 6],
        ],
        extra: (
          <>
            <path d="M10,37 Q24,28 38,37 V40 H10 Z" fill={WALL} />
          </>
        ),
      };
    case "slipflange":
    case "blindflange":
      return {
        runs: [],
        extra: (
          <>
            <circle cx="24" cy="32" r="20" fill={WALL} />
            <circle cx="24" cy="32" r={kind === "blindflange" ? 0 : 8} fill={BORE} />
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <circle
                key={a}
                cx={24 + 14 * Math.cos((a * Math.PI) / 180)}
                cy={32 + 14 * Math.sin((a * Math.PI) / 180)}
                r="2"
                fill={BORE}
              />
            ))}
          </>
        ),
      };
    case "stubend":
      return {
        runs: [["M4,32 H34", 9]],
        extra: (
          <>
            <rect x="34" y="16" width="7" height="32" rx="1" fill={WALL} />
          </>
        ),
      };
    case "tail":
      return {
        runs: [["M4,32 H44", 8]],
        extra: (
          <>
            <rect x="18" y="24" width="6" height="16" fill={WALL} />
          </>
        ),
      };
    case "tailflange":
      return {
        runs: [["M4,32 H34", 8]],
        extra: (
          <>
            <rect x="34" y="12" width="7" height="40" rx="1" fill={WALL} />
            <circle cx="37.5" cy="18" r="1.6" fill={BORE} />
            <circle cx="37.5" cy="46" r="1.6" fill={BORE} />
          </>
        ),
      };
  }
}

export function FittingDrawing({ description }: { description: string }) {
  const kind = fittingKind(description);
  if (!kind) return null;
  const d = shape(kind);
  const size = /(\d+(?:\.\d+)?(?:\s*[×x]\s*\d+(?:\.\d+)?)?)\s*mm/i
    .exec(description)?.[1]
    ?.replace(/\s*[×x]\s*/, " × ");
  return (
    <svg
      viewBox="0 0 180 60"
      role="img"
      aria-label={`Fitting drawing${size ? `, ${size} mm` : ""}`}
      className="h-[12.5mm] w-[37.5mm] shrink-0 overflow-visible"
      fontSize="9.5"
    >
      {d.runs.map(([p, w]) => (
        <path
          key={`w${p}`}
          d={p}
          fill="none"
          stroke={WALL}
          strokeWidth={w}
          strokeLinejoin="round"
        />
      ))}
      {d.runs.map(([p, w]) => (
        <path
          key={`b${p}`}
          d={p}
          fill="none"
          stroke={BORE}
          strokeWidth={w * 0.45}
          strokeLinejoin="round"
        />
      ))}
      {d.extra}
      {size && (
        <text x="56" y="35">
          <tspan fill="var(--qd-muted, #64748b)">Size </tspan>
          <tspan fill="var(--qd-ink, #1e293b)" fontWeight="600">
            {size} mm
          </tspan>
        </text>
      )}
    </svg>
  );
}
