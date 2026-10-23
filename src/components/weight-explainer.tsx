import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { fmtNum } from "@/lib/quote";
import { PE_DENSITY } from "@/lib/weights";

// Five-step walkthrough of how kg/m is worked out for one pipe: pick → wall → strip → one metre → weigh.
const STEPS = ["The pipe", "The wall", "Unroll it", "One metre", "Weigh it"];

export function WeightExplainer({
  od,
  sdr,
  min,
  max,
  grades,
  grade,
  chartKg,
  sample,
}: {
  od: number;
  sdr: number;
  min: number;
  max: number;
  grades: { grade: string; pn: number | null }[]; // each grade's PN at this SDR
  grade?: string | undefined; // the grade that was picked, if any
  chartKg: number;
  sample: boolean;
}) {
  const [step, setStep] = useState(0);
  const [t, setT] = useState(0.5); // 0 = minimum wall, 1 = maximum wall
  const [metres, setMetres] = useState("100");
  // a different pipe starts the walkthrough again (the drawer itself stays as the user left it)
  useEffect(() => {
    setStep(0);
    setT(0.5);
  }, [od, sdr, min, max]);
  const wall = min + (max - min) * t;
  const stripLen = Math.PI * (od - wall); // length of the ring if cut open at its middle
  const area = stripLen * wall; // mm²
  const volume = area; // mm² × 1000 mm ÷ 1000 = cm³ for one metre
  const grams = volume * PE_DENSITY;
  const m = Number(metres) || 0;
  const at = (v: number) => fmtNum(v, 1);
  const pickedPn = grades.find((g) => g.grade === grade)?.pn;
  const title = sample ? `${od} mm · PE63 · PN 6` : `${od} mm · SDR ${sdr}`;

  // cross-section: outer circle with the wall as a ring (wall drawn at true proportion, at least 5 px)
  const R = 58;
  const ring = Math.max(5, (wall / od) * 2 * R);

  return (
    <details className="group rounded-2xl border border-border p-4 text-sm">
      <summary className="mb-3 flex cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden">
        <span>
          How is the weight worked out?
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {sample ? "Example: " : "Your selection: "}
            {title}
            {sample && " · click any cell in the chart to try another size"}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <ol className="mb-4 flex gap-1" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={i === step}
              className={`w-full rounded-lg px-1 py-1.5 text-xs font-semibold ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_1fr] md:items-center">
        {/* picture */}
        <svg
          viewBox="0 0 240 150"
          className="mx-auto w-full max-w-[15rem]"
          role="img"
          aria-label="Diagram"
        >
          {step <= 1 && (
            <g>
              <circle cx="75" cy="85" r={R} fill="#1e293b" />
              <circle cx="75" cy="85" r={R - ring} fill="#f1f5f9" />
              <line x1={75 - R} y1="14" x2={75 + R} y2="14" stroke="#0b4f7c" strokeWidth="1.5" />
              <line x1={75 - R} y1="9" x2={75 - R} y2="19" stroke="#0b4f7c" strokeWidth="1.5" />
              <line x1={75 + R} y1="9" x2={75 + R} y2="19" stroke="#0b4f7c" strokeWidth="1.5" />
              <text x="75" y="9" textAnchor="middle" fontSize="11" fill="#0b4f7c" fontWeight="600">
                OD {od} mm
              </text>
              {step === 1 && (
                <>
                  <line
                    x1={75 + (R - ring / 2) * Math.SQRT1_2}
                    y1={85 + (R - ring / 2) * Math.SQRT1_2}
                    x2="160"
                    y2={85 + (R - ring / 2) * Math.SQRT1_2}
                    stroke="#f97316"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={75 + (R - ring / 2) * Math.SQRT1_2}
                    cy={85 + (R - ring / 2) * Math.SQRT1_2}
                    r="2.5"
                    fill="#f97316"
                  />
                  <text
                    x="164"
                    y={89 + (R - ring / 2) * Math.SQRT1_2}
                    fontSize="11"
                    fill="#f97316"
                    fontWeight="600"
                  >
                    wall {at(wall)} mm
                  </text>
                </>
              )}
            </g>
          )}
          {step === 2 && (
            <g>
              <text x="120" y="22" textAnchor="middle" fontSize="11" fill="#64748b">
                cut the ring open and lay it flat
              </text>
              <rect x="10" y="50" width="220" height="30" rx="3" fill="#1e293b" />
              <text
                x="120"
                y="45"
                textAnchor="middle"
                fontSize="11"
                fill="#0b4f7c"
                fontWeight="600"
              >
                length = π × ({od} − {at(wall)}) = {at(stripLen)} mm
              </text>
              <text
                x="120"
                y="102"
                textAnchor="middle"
                fontSize="11"
                fill="#f97316"
                fontWeight="600"
              >
                thickness = {at(wall)} mm (drawn thicker)
              </text>
              <text
                x="120"
                y="130"
                textAnchor="middle"
                fontSize="12"
                fill="#334155"
                fontWeight="700"
              >
                area = {at(area)} mm²
              </text>
            </g>
          )}
          {step === 3 && (
            <g>
              <rect x="30" y="60" width="190" height="34" fill="#1e293b" />
              <ellipse cx="30" cy="77" rx="12" ry="17" fill="#475569" />
              <ellipse cx="30" cy="77" rx="6" ry="11" fill="#f1f5f9" />
              <line x1="30" y1="112" x2="220" y2="112" stroke="#0b4f7c" strokeWidth="1.5" />
              <line x1="30" y1="107" x2="30" y2="117" stroke="#0b4f7c" strokeWidth="1.5" />
              <line x1="220" y1="107" x2="220" y2="117" stroke="#0b4f7c" strokeWidth="1.5" />
              <text
                x="125"
                y="130"
                textAnchor="middle"
                fontSize="11"
                fill="#0b4f7c"
                fontWeight="600"
              >
                1 metre = 1000 mm
              </text>
              <text
                x="125"
                y="42"
                textAnchor="middle"
                fontSize="11"
                fill="#334155"
                fontWeight="700"
              >
                plastic in 1 m = {at(volume)} cm³
              </text>
            </g>
          )}
          {step === 4 && (
            <g>
              <rect x="40" y="95" width="160" height="14" rx="4" fill="#cbd5e1" />
              <rect x="60" y="60" width="120" height="35" rx="6" fill="#1e293b" />
              <text x="120" y="82" textAnchor="middle" fontSize="12" fill="#fff" fontWeight="700">
                {fmtNum(grams / 1000, 3)} kg
              </text>
              <text x="120" y="130" textAnchor="middle" fontSize="11" fill="#64748b">
                one metre of this pipe
              </text>
              <text
                x="120"
                y="40"
                textAnchor="middle"
                fontSize="11"
                fill="#334155"
                fontWeight="700"
              >
                {at(volume)} cm³ × {PE_DENSITY} g/cm³
              </text>
            </g>
          )}
        </svg>

        {/* words */}
        <div className="space-y-2">
          {step === 0 && (
            <>
              <p>
                Pick the grade and the pressure (PN). Together they fix the <b>SDR</b>, the ratio of
                the pipe's size to its wall.
              </p>
              <div className="flex flex-wrap gap-2">
                {grades.map((g) => (
                  <span
                    key={g.grade}
                    className={`rounded-lg border px-2 py-1 text-xs ${g.grade === grade || (sample && g.grade === "PE63") ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground"}`}
                  >
                    {g.grade} {g.pn != null ? `PN ${g.pn}` : "not made"}
                  </span>
                ))}
              </div>
              <p>
                {sample ? "PE63 at PN 6" : pickedPn ? `${grade} at PN ${pickedPn}` : "This column"}{" "}
                is <b>SDR {sdr}</b>. The standard then gives the {od} mm wall for SDR {sdr}:{" "}
                <b>
                  {at(min)} to {at(max)} mm
                </b>
                .
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <p>
                A pipe's wall may be anywhere between the minimum and maximum. The chart uses the{" "}
                <b>middle</b>. Drag to see how the wall changes the weight:
              </p>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={t}
                onChange={(e) => setT(Number(e.target.value))}
                aria-label="Wall thickness between minimum and maximum"
                className="w-full accent-[var(--primary)]"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>min {at(min)}</span>
                <b className="text-foreground">wall {at(wall)} mm</b>
                <span>max {at(max)}</span>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-primary"
                onClick={() => setT(0.5)}
              >
                Back to the middle (chart value)
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <p>
                The wall is a thin ring. Cut it open at its middle and lay it flat: it becomes a
                strip.
              </p>
              <p>
                Strip length = π × (OD − wall) = π × ({od} − {at(wall)}) = <b>{at(stripLen)} mm</b>
                <br />
                Strip thickness = wall = <b>{at(wall)} mm</b>
              </p>
              <p>
                Area of plastic in the cross-section = {at(stripLen)} × {at(wall)} ={" "}
                <b>{at(area)} mm²</b>
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <p>
                Stretch that strip along one metre (1000 mm) of pipe. The plastic in that metre has
                a volume of:
              </p>
              <p>
                {at(area)} mm² × 1000 mm = {fmtNum(area * 1000, 0)} mm³ = <b>{at(volume)} cm³</b>
              </p>
              <p className="text-xs text-muted-foreground">
                (1000 mm³ is 1 cm³, so the mm² number and the cm³ number are the same.)
              </p>
            </>
          )}
          {step === 4 && (
            <>
              <p>
                HDPE weighs about <b>{PE_DENSITY} g per cm³</b>, a little less than water.
              </p>
              <p>
                {at(volume)} cm³ × {PE_DENSITY} = {at(grams)} g ={" "}
                <b className="text-base">{fmtNum(grams / 1000, 3)} kg per metre</b>
                {t === 0.5 && <> (the chart shows {fmtNum(chartKg, 3)})</>}
              </p>
              <label className="flex items-center gap-2">
                <span>How many metres?</span>
                <input
                  inputMode="decimal"
                  value={metres}
                  onChange={(e) => setMetres(e.target.value)}
                  className="h-9 w-24 rounded-lg border border-input bg-background px-2 text-right tabular-nums"
                />
                <span>
                  = <b>{fmtNum((grams / 1000) * m, 1)} kg</b>
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                Wall thicknesses come from IS 4984. The standard prints no weights: they come from
                your factory chart or from this sum. Real pipes vary within the wall limits, so
                expect a few percent difference.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-primary disabled:opacity-30"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => setStep(step === STEPS.length - 1 ? 0 : step + 1)}
          className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground"
        >
          {step === STEPS.length - 1 ? "Start again" : "Next →"}
        </button>
      </div>
    </details>
  );
}
