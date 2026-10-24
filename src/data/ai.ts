import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authed } from "./auth.server";
import { getEnv } from "./env.server";
import { EXTRACT_SYSTEM, getProvider } from "./ai.server";
import { ACCEPTED_MIME, MAX_FILE_BYTES, extractionSchema } from "@/lib/ai/inbound";

const message = z.object({
  source: z.enum(["upload", "email"]).default("upload"),
  subject: z.string().max(500).optional(),
  from: z.string().max(500).optional(),
  text: z.string().max(30_000).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().max(200),
        mime: z.string().refine((m) => ACCEPTED_MIME.includes(m), "Unsupported file type"),
        // base64 is ~4/3 of the raw size
        base64: z.string().max(Math.ceil((MAX_FILE_BYTES * 4) / 3) + 16),
      }),
    )
    .max(3),
});

// Turn a raw enquiry (text and/or files) into structured items. It does not price anything or touch
// the database; matching to the catalog and pricing happen afterwards from the real product list.
export const extractEnquiry = createServerFn({ method: "POST" })
  .middleware([authed])
  .validator(message)
  .handler(async ({ data }) => {
    if (!data.text?.trim() && !data.attachments.length) throw new Error("Add some text or a file");
    const provider = getProvider(await getEnv());
    const raw = await provider.extractJson({ system: EXTRACT_SYSTEM, message: data });
    let json: unknown;
    try {
      json = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      throw new Error("The AI reply was not valid JSON, try again");
    }
    return { provider: provider.name, extraction: extractionSchema.parse(json) };
  });
