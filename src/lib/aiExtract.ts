/**
 * Server function: read one drawing page with Claude and return candidate values for the
 * review table. The API key is read from the hosting environment (ANTHROPIC_API_KEY) and
 * never reaches the browser; the page image and text are sent for this request only and
 * nothing is stored on the server.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  EXTRACTION_MODEL,
  EXTRACTION_PRICE,
  EXTRACTION_SCHEMA,
  type ExtractionRequest,
  type ExtractionResult,
} from "@/engine/project/extraction";

const requestSchema = z.object({
  image: z.string().min(100).max(15_000_000),
  imageWidth: z.number().positive(),
  imageHeight: z.number().positive(),
  text: z.string().max(400_000),
  sheet: z.string(),
  page: z.number().int().positive(),
  members: z.array(
    z.object({
      mark: z.string(),
      kind: z.string(),
      description: z.string(),
      fields: z.array(z.object({ field: z.string(), label: z.string() })),
    }),
  ),
});

const SYSTEM = `You read structural drawings (plans, sections, details, schedules and general notes for wood-frame houses, with concrete and CMU foundations) and record the values a structural engineer needs to check members. You are given one page as an image together with the vector text extracted from the PDF, and the list of members in the engineer's project with the fields each one accepts.

Record only values that are written on this page: member sizes and grades, spans and lengths, spacings, plate heights, footing sizes and reinforcement, shear wall marks with sheathing and nailing, hold-downs and connectors, anchor bolts, design loads and criteria. Give each value exactly as written (for example 12'-6", 2x10 @ 16" O.C., (2) #4 T&B). Prefer the vector text over the image when they disagree, and quote the supporting text as evidence.

Link an item to a member only when the drawing names that member's mark or the match is unambiguous; then use one of the field keys listed for it. Otherwise leave memberMark and field empty. Do not compute, convert or assume values, and do not fill gaps from typical practice. Mark confidence low when the text is small, overlapped or partly hidden, and describe anything unreadable or conflicting in notes. Every value will be confirmed by the engineer before it is used.`;

export const extractDrawingPage = createServerFn({ method: "POST" })
  .validator((d: unknown) => requestSchema.parse(d) as ExtractionRequest)
  .handler(async ({ data }): Promise<ExtractionResult> => {
    if (!process.env.ANTHROPIC_API_KEY)
      throw new Error(
        "AI extraction is not configured: set ANTHROPIC_API_KEY in the hosting environment (do not paste keys into the app).",
      );
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const memberList = data.members.length
      ? data.members
          .map(
            (m) =>
              `${m.mark} (${m.kind}${m.description ? `, ${m.description}` : ""}): ${m.fields.map((f) => `${f.field} = ${f.label}`).join("; ")}`,
          )
          .join("\n")
      : "(no members yet — leave memberMark and field empty)";
    try {
      const stream = client.beta.messages.stream({
        model: EXTRACTION_MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: data.image } },
              {
                type: "text",
                text: `Page ${data.page}${data.sheet ? `, sheet ${data.sheet}` : ""}.\n\nVector text of the page:\n<page_text>\n${data.text || "(no vector text — scanned page)"}\n</page_text>\n\nProject members and their fields:\n<members>\n${memberList}\n</members>\n\nRecord the values on this page.`,
              },
            ],
          },
        ],
      });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") throw new Error("The model declined to read this page.");
      if (msg.stop_reason === "max_tokens")
        throw new Error("The page produced too much output — try a page with fewer values.");
      const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const parsed = JSON.parse(text) as Omit<ExtractionResult, "usage" | "model">;
      const input =
        msg.usage.input_tokens +
        (msg.usage.cache_creation_input_tokens ?? 0) +
        (msg.usage.cache_read_input_tokens ?? 0);
      const output = msg.usage.output_tokens;
      return {
        sheet: parsed.sheet ?? "",
        items: Array.isArray(parsed.items) ? parsed.items : [],
        notes: parsed.notes ?? "",
        usage: { input, output, cost: (input * EXTRACTION_PRICE.input + output * EXTRACTION_PRICE.output) / 1e6 },
        model: msg.model,
      };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError)
        throw new Error("ANTHROPIC_API_KEY was rejected — check the key in the hosting environment.");
      if (e instanceof Anthropic.RateLimitError) throw new Error("Rate limited by the API — try again in a minute.");
      if (e instanceof Anthropic.APIError) throw new Error(`Claude API error ${e.status}: ${e.message}`);
      if (e instanceof SyntaxError) throw new Error("The extraction result could not be read — try again.");
      throw e;
    }
  });
