"use server";

import {
  convertToPnr,
  parsedFromAiProposal,
  pnrResultFromParsed,
} from "@/lib/pnr/convert";
import { pnrConvertInputSchema, type PnrConvertResult } from "@/lib/schemas";
import { convertItineraryWithAi, pnrAiConfig } from "@/server/ai/pnr";
import { actionUser } from "@/server/guard";
import { AI_LIMIT, AI_WINDOW_MS, consumeRateLimit } from "@/server/rate-limit";
import { errorMessage } from "@/server/actions/types";

export interface PnrConvertActionResult {
  ok: boolean;
  error?: string;
  result?: PnrConvertResult;
  method?: "rules" | "ai";
}

/** Read-only conversion: never writes to a quotation or the database. */
export async function convertPnrAction(input: unknown): Promise<PnrConvertActionResult> {
  try {
    const user = await actionUser("manageQuotations");
    const parsed = pnrConvertInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the pasted text" };
    }
    const referenceYear = parsed.data.referenceYear;
    let rulesResult: PnrConvertResult | null = null;
    let rulesError: string | null = null;
    try {
      rulesResult = convertToPnr(parsed.data.text, { referenceYear });
    } catch (error) {
      rulesError = errorMessage(error);
    }

    // AI is the fallback for arbitrary itinerary layouts. A clean PNR from
    // booking-system output never needs a model call.
    const ai = await pnrAiConfig();
    const needsAi =
      ai.enabled &&
      Boolean(ai.apiKey) &&
      (!rulesResult || rulesResult.format === "itinerary");
    if (needsAi) {
      const limit = consumeRateLimit(`ai-pnr:${user.id}`, {
        limit: AI_LIMIT,
        windowMs: AI_WINDOW_MS,
      });
      if (!limit.allowed) {
        if (rulesResult) {
          return {
            ok: true,
            method: "rules",
            result: {
              ...rulesResult,
              warnings: [
                ...rulesResult.warnings,
                "AI conversion is temporarily rate limited; using the rule-based result.",
              ],
            },
          };
        }
        return {
          ok: false,
          error: "Too many AI conversions. Try again in a few minutes.",
        };
      }
      const proposal = await convertItineraryWithAi(
        parsed.data.text,
        referenceYear ?? new Date().getUTCFullYear(),
        ai,
      );
      if (proposal.ok) {
        try {
          return {
            ok: true,
            method: "ai",
            result: pnrResultFromParsed(parsedFromAiProposal(proposal.proposal), "itinerary", [
              "Converted with AI. Check every flight, date and passenger before using it.",
            ]),
          };
        } catch (error) {
          if (!rulesResult) return { ok: false, error: errorMessage(error) };
        }
      } else if (!rulesResult) {
        return { ok: false, error: proposal.error };
      }
    }

    if (rulesResult) return { ok: true, method: "rules", result: rulesResult };
    return {
      ok: false,
      error:
        rulesError ??
        "No flight segments were recognised. Add AI settings in Settings → AI to convert free-form itineraries.",
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
