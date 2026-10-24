import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authed } from "./auth.server";
import { getEnv } from "./env.server";
import { runExtraction } from "./ai.server";
import { MAX_FILE_BYTES } from "@/lib/ai/inbound";

const message = z.object({
  source: z.enum(["upload", "email"]).default("upload"),
  subject: z.string().max(500).optional(),
  from: z.string().max(500).optional(),
  text: z.string().max(30_000).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().max(200),
        mime: z.string().max(200),
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
    return runExtraction(await getEnv(), data);
  });
