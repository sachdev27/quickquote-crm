import type { Env } from "./env.server";
import type { InboundMessage } from "@/lib/ai/inbound";

// One interface for every model vendor. To add OpenAI or Claude, implement `extractJson` and register
// it below; nothing else in the pipeline changes. Select with the AI_PROVIDER variable.
export interface AiProvider {
  name: string;
  // Returns the model's raw JSON text for the system prompt plus the message (text and files).
  extractJson(args: { system: string; message: InboundMessage }): Promise<string>;
}

const gemini = (env: Env): AiProvider => ({
  name: "gemini",
  async extractJson({ system, message }) {
    const key = env.GEMINI_API_KEY;
    if (!key)
      throw new Error("GEMINI_API_KEY is not set (add it as a Worker secret / in .dev.vars)");
    const model = env.AI_MODEL || "gemini-2.5-flash";
    const head = [
      message.subject && `Subject: ${message.subject}`,
      message.from && `From: ${message.from}`,
    ]
      .filter(Boolean)
      .join("\n");
    const parts: unknown[] = [
      { text: [head, message.text].filter(Boolean).join("\n\n") || "(see attached file)" },
      ...message.attachments.map((a) => ({ inline_data: { mime_type: a.mime, data: a.base64 } })),
    ];
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const out = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!out) throw new Error("The model returned no text (the file may be unreadable or blocked)");
    return out;
  },
});

const PROVIDERS: Record<string, (env: Env) => AiProvider> = { gemini };

export function getProvider(env: Env): AiProvider {
  const name = (env.AI_PROVIDER || "gemini").toLowerCase();
  const make = PROVIDERS[name];
  if (!make)
    throw new Error(
      `Unknown AI_PROVIDER "${name}". Available: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  return make(env);
}

export const EXTRACT_SYSTEM = `You read customer enquiries for an Indian HDPE pipe, sprinkler and fittings manufacturer and turn them into structured data.
The input may be an email (with signatures, disclaimers, quoted replies, forwards), a PDF, a photo of a handwritten or printed list, or a WhatsApp-style message. Ignore everything that is not part of the customer's request.
Return ONLY JSON of this shape:
{"customer":{"name":string|null,"company":string|null,"phone":string|null,"email":string|null,"gstin":string|null}|null,
 "items":[{"raw":string,"kind":"pipe"|"sprinkler"|"fitting"|"other","od_mm":number|null,"pn":number|null,"grade":"PE63"|"PE80"|"PE100"|null,"qty":number|null,"unit":"m"|"rolls"|"pc"|"kg"|null,"brand":string|null}],
 "notes":string|null}
Rules:
- One item per requested product line. "raw" is that line's original wording, cleaned of noise.
- Pipes: od_mm is the outside diameter in mm (32, 63, 110...). "1 inch" = 32, "2 inch" = 63, "3 inch" = 90, "4 inch" = 110. pn is the pressure rating as a number (PN6 -> 6, "6 kg" -> 6). grade is PE63, PE80 or PE100; null when not stated.
- qty is the number requested. unit "m" for metres/mtr, "rolls" for coils/rolls/bundles, "pc" for pieces/nos, "kg" for weight.
- Never invent a price, size or quantity that is not in the input. Use null for anything unknown.
- "customer" is the person or company asking for the quotation (not our company). "notes" holds delivery place, deadlines or special conditions.`;
