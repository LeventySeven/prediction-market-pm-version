import { z } from "zod";
import {
  MAX_MARKET_REF_LENGTH,
  MAX_METADATA_BYTES,
  MAX_SESSION_ID_LENGTH,
  MIN_MARKET_REF_LENGTH,
  MIN_SESSION_ID_LENGTH,
} from "../constants";
import { apiVersionV1Schema, jsonValueSchema, userEventTypeSchema, venueProviderSchema } from "./common";

export const trackEventInput = z.object({
  sessionId: z.string().min(MIN_SESSION_ID_LENGTH).max(MAX_SESSION_ID_LENGTH),
  marketId: z.string().min(MIN_MARKET_REF_LENGTH).max(MAX_MARKET_REF_LENGTH),
  provider: venueProviderSchema.optional(),
  eventType: userEventTypeSchema,
  value: z.number().finite().optional(),
  metadata: z.record(z.string(), jsonValueSchema).optional(),
});

export const trackEventOutput = z.object({
  apiVersion: apiVersionV1Schema,
  ok: z.boolean(),
});

export const EVENT_METADATA_MAX_BYTES = MAX_METADATA_BYTES;
