import { getSupabaseServiceClient } from "@/src/server/supabase/client";
import { verifyAuthToken } from "@/src/server/auth/jwt";
import { parseCookies } from "@/src/server/http/cookies";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

const fail = (status: number, code: string, details?: string) =>
  Response.json({ error: code, details: details ?? null }, { status });

export async function POST(req: Request) {
  const cookies = parseCookies(req);
  const token = cookies["auth_token"];
  if (!token) {
    return fail(401, "UNAUTHORIZED");
  }

  let payload: { sub: string };
  try {
    payload = (await verifyAuthToken(token)) as { sub: string };
  } catch {
    return fail(401, "UNAUTHORIZED");
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail(400, "MISSING_FILE");
  }

  // Keep uploads simple + safe: allow common raster formats only (no SVG).
  const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!allowedTypes.has(file.type)) {
    return fail(400, "INVALID_FILE_TYPE");
  }

  const maxBytes = 5 * 1024 * 1024; // 5MB (larger than avatars for market images)
  if (file.size > maxBytes) {
    return fail(400, "FILE_TOO_LARGE");
  }

  const ext =
    (file.name.split(".").pop() || "").toLowerCase().slice(0, 8) ||
    (file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
      ? "webp"
      : file.type === "image/gif"
      ? "gif"
      : "jpg");

  const userId = payload.sub;
  const objectName = `${Date.now()}_${randomBytes(8).toString("hex")}.${ext}`;

  let supabase;
  try {
    supabase = getSupabaseServiceClient();
  } catch (error) {
    return fail(
      500,
      "SERVICE_ROLE_UNAVAILABLE",
      error instanceof Error ? error.message : String(error)
    );
  }
  const uploadRes = await supabase.storage.from("market-images").upload(objectName, file, {
    upsert: false, // Don't allow overwriting for market images
    contentType: file.type,
    cacheControl: "3600",
  });

  if (uploadRes.error) {
    const msg = String(uploadRes.error.message ?? "").toLowerCase();
    if (msg.includes("bucket") && msg.includes("not")) {
      return fail(500, "BUCKET_NOT_FOUND", uploadRes.error.message);
    }
    return fail(500, "UPLOAD_FAILED", uploadRes.error.message);
  }

  const publicUrl = supabase.storage.from("market-images").getPublicUrl(objectName).data.publicUrl;
  return Response.json({ imageUrl: publicUrl });
}
