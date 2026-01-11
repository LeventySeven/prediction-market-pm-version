import { getSupabaseServiceClient } from "@/src/server/supabase/client";
import { verifyAuthToken } from "@/src/server/auth/jwt";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

function parseCookies(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    })
  );
}

export async function POST(req: Request) {
  const cookies = parseCookies(req);
  const token = cookies["auth_token"];
  if (!token) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let payload: { sub: string };
  try {
    payload = (await verifyAuthToken(token)) as { sub: string };
  } catch {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "MISSING_FILE" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "INVALID_FILE_TYPE" }, { status: 400 });
  }

  const maxBytes = 5 * 1024 * 1024; // 5MB (larger than avatars for market images)
  if (file.size > maxBytes) {
    return Response.json({ error: "FILE_TOO_LARGE" }, { status: 400 });
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

  const supabase = getSupabaseServiceClient();
  const uploadRes = await supabase.storage.from("market-images").upload(objectName, file, {
    upsert: false, // Don't allow overwriting for market images
    contentType: file.type,
    cacheControl: "3600",
  });

  if (uploadRes.error) {
    return Response.json({ error: uploadRes.error.message }, { status: 500 });
  }

  const publicUrl = supabase.storage.from("market-images").getPublicUrl(objectName).data.publicUrl;
  return Response.json({ imageUrl: publicUrl });
}
