import { z } from "zod";

// Everything that can start an AI quote (an uploaded file, pasted text, later a mailbox poll) is
// normalised to this shape first, so the extraction pipeline never cares where it came from.
export interface InboundMessage {
  source: "upload" | "email";
  subject?: string | undefined;
  from?: string | undefined;
  text?: string | undefined;
  attachments: { name: string; mime: string; base64: string }[];
}

export const ACCEPTED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
];
export const MAX_FILE_BYTES = 6 * 1024 * 1024;

const num = z.preprocess(
  (v) => (v === "" || v == null ? null : typeof v === "string" ? Number(v) : v),
  z.number().finite().nullable(),
);
const str = z.preprocess((v) => (v == null || v === "" ? null : String(v)), z.string().nullable());

// Models answer "mtr", "coil", "nos"...; fold the common wordings into our four units.
function normUnit(v: unknown) {
  if (typeof v !== "string") return null;
  const u = v.toLowerCase().trim();
  if (/^(m|mt|mtr|mtrs|meter|meters|metre|metres|mts)$/.test(u)) return "m";
  if (/^(roll|rolls|coil|coils|bundle|bundles)$/.test(u)) return "rolls";
  if (/^(pc|pcs|piece|pieces|no|nos|number|numbers|unit|units)$/.test(u)) return "pc";
  if (/^(kg|kgs|kilogram|kilograms)$/.test(u)) return "kg";
  return null;
}

export const extractionSchema = z.object({
  customer: z
    .object({ name: str, company: str, phone: str, email: str, gstin: str })
    .nullable()
    .default(null),
  items: z
    .array(
      z.object({
        raw: z.string().default(""),
        kind: z.enum(["pipe", "sprinkler", "fitting", "other"]).catch("other"),
        od_mm: num.default(null),
        pn: num.default(null),
        grade: str.default(null),
        qty: num.default(null),
        unit: z
          .preprocess(normUnit, z.enum(["m", "rolls", "pc", "kg"]).nullable())
          .catch(null)
          .default(null),
        brand: str.default(null),
      }),
    )
    .default([]),
  notes: str.default(null),
});
export type Extraction = z.infer<typeof extractionSchema>;
export type ExtractedItem = Extraction["items"][number];
