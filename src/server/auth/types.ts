export type PublicUser = {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileDescription: string | null;
  avatarPalette: { primary: string; secondary: string } | null;
  needsProfileSetup: boolean;
  telegramPhotoUrl: string | null;
  balance: number;
  createdAt: string;
  isAdmin: boolean;
  privyUserId: string | null;
  walletAddress: string | null;
};
