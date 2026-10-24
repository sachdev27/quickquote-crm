import type { Env } from "./env.server";
import { extractionSchema, type InboundMessage } from "@/lib/ai/inbound";
import {
  MAX_TEXT_CHARS,
  classify,
  docxToText,
  fromBase64,
  htmlToText,
  xlsxToText,
} from "@/lib/ai/files";

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
    const model = env.AI_MODEL || "gemini-3.5-flash-lite";
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const init = {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    };
    // 429/503 are Google's "busy" answers; two quick retries clear most of them
    let res = await fetch(url, init);
    for (let i = 0; i < 2 && (res.status === 503 || res.status === 429); i++) {
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      res = await fetch(url, init);
    }
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
The input can be anything a customer sends: an email (with signatures, disclaimers, quoted replies, forwards), a WhatsApp or SMS message or an exported chat (lines like "[12/03/25, 10:32] Name: text", emojis, voice-note audio), a PDF, a photo or screenshot of a handwritten or printed list, a Word document, or an Excel/CSV table of items. It may be in English, Hindi, Marathi or Hinglish, with short forms ("63 pn6 2 roll", "1 inch 4kg 500mtr", "nos", "mtr"). When a chat has several messages, collect every product request in it, and if the customer later corrects a quantity or size use the corrected one. Ignore greetings, small talk and anything that is not part of the request.
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

// PDFs, photos and voice notes go to the model as they are; Word, Excel and text-like files are read
// to text here and appended to the message, so the provider only ever sees text plus inline media.
async function prepare(data: InboundMessage): Promise<InboundMessage> {
  const attachments: InboundMessage["attachments"] = [];
  const extra: string[] = [];
  for (const a of data.attachments) {
    const c = classify(a.name, a.mime);
    if (!c) throw new Error(`${a.name}: unsupported file type`);
    if (c.kind === "inline") {
      attachments.push({ name: a.name, mime: c.mime, base64: a.base64 });
      continue;
    }
    const bytes = fromBase64(a.base64);
    let body: string;
    try {
      body =
        c.kind === "docx"
          ? docxToText(bytes)
          : c.kind === "xlsx"
            ? xlsxToText(bytes)
            : /\.html?$/i.test(a.name) || c.mime === "text/html"
              ? htmlToText(new TextDecoder().decode(bytes))
              : new TextDecoder().decode(bytes);
    } catch (e) {
      throw new Error(`${a.name}: ${e instanceof Error ? e.message : "could not be read"}`);
    }
    extra.push(`--- Attachment: ${a.name} ---\n${body}`);
  }
  const text = [data.text, ...extra].filter(Boolean).join("\n\n").slice(0, MAX_TEXT_CHARS);
  return { ...data, text, attachments };
}

// The whole pipeline for one enquiry from any source (upload now, Gmail, a future mailbox poll).
export async function runExtraction(env: Env, data: InboundMessage) {
  const provider = getProvider(env);
  const raw = await provider.extractJson({ system: EXTRACT_SYSTEM, message: await prepare(data) });
  let json: unknown;
  try {
    json = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new Error("The AI reply was not valid JSON, try again");
  }
  return { provider: provider.name, extraction: extractionSchema.parse(json) };
}
