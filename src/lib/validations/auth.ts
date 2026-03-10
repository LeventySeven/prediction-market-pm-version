import { z } from "zod";
import { MIN_MARKET_REF_LENGTH } from "../constants";

export const privyLoginInput = z.object({
  accessToken: z.string().min(MIN_MARKET_REF_LENGTH),
});
