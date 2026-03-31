export type ErrorLike =
  | string
  | Error
  | { message?: string; data?: { message?: string } }
  | null
  | undefined;

export const getErrorMessage = (error: ErrorLike): string | undefined => {
  if (!error) return undefined;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    if (typeof error.message === "string") return error.message;
    if (error.data && typeof error.data.message === "string") return error.data.message;
  }
  return undefined;
};
