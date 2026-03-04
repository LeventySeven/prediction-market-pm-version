export const normalizeHexAddress = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^0x[a-f0-9]{40}$/i.test(trimmed) ? trimmed.toLowerCase() : null;
};

export const normalizeSlug = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
};

const normalizeSocketNamespace = (value: string): string => {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

export const resolveSocketIoConnection = (
  rawUrl: string
): { transportUrl: string; namespace: string } => {
  const parsed = new URL(rawUrl);
  const path = parsed.pathname.replace(/\/+$/, "");
  const namespace =
    path && path !== "/socket.io" ? normalizeSocketNamespace(path) : "/markets";

  parsed.pathname = "/socket.io/";
  parsed.searchParams.set("EIO", "4");
  parsed.searchParams.set("transport", "websocket");

  return {
    transportUrl: parsed.toString(),
    namespace,
  };
};

export const encodeSocketIoEventPacket = (
  namespace: string,
  event: string,
  payload: unknown
): string =>
  namespace === "/"
    ? `42${JSON.stringify([event, payload])}`
    : `42${namespace},${JSON.stringify([event, payload])}`;

export const parseSocketIoEventPacket = (
  raw: string,
  namespace: string
): { event: string; payload: unknown } | null => {
  if (!raw.startsWith("42")) return null;
  let packet = raw.slice(2);

  if (packet.startsWith("/")) {
    const commaIdx = packet.indexOf(",");
    if (commaIdx <= 0) return null;
    const packetNamespace = packet.slice(0, commaIdx);
    if (packetNamespace !== namespace) return null;
    packet = packet.slice(commaIdx + 1);
  }

  const listStart = packet.indexOf("[");
  if (listStart < 0) return null;
  try {
    const parsed = JSON.parse(packet.slice(listStart));
    if (!Array.isArray(parsed) || typeof parsed[0] !== "string") return null;
    return { event: parsed[0], payload: parsed[1] };
  } catch {
    return null;
  }
};
