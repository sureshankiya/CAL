/** Static build: AI extraction needs the server (ANTHROPIC_API_KEY on the host) and is unavailable here. */
import type { ExtractionRequest, ExtractionResult } from "@/engine/project/extraction";

export async function extractDrawingPage(_: { data: ExtractionRequest }): Promise<ExtractionResult> {
  throw new Error(
    "AI extraction is not available in this static build — it runs only on the server-hosted app. Enter values in the review table manually.",
  );
}
