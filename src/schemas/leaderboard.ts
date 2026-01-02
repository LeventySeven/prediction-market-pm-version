import { z } from "zod";

export const leaderboardUserSchema = z.object({
  id: z.string(),
  rank: z.number(),
  name: z.string(),
  username: z.string().optional(),
  avatar: z.string(),
  balance: z.number(),
  pnl: z.number(),
  referrals: z.number().optional(),
  betCount: z.number().optional(),
});

export type LeaderboardUser = z.infer<typeof leaderboardUserSchema>;

export const leaderboardUsersSchema = z.array(leaderboardUserSchema);


