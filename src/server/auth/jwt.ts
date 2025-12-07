import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = process.env.AUTH_JWT_SECRET;
const JWT_ISSUER = "pravda-app";
const JWT_AUDIENCE = "pravda-users";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getKey() {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("AUTH_JWT_SECRET is not set or too short (min 32 chars)");
  }
  return new TextEncoder().encode(JWT_SECRET);
}

type JwtPayload = {
  sub: string;
  email: string;
  username: string;
};

export async function signAuthToken(payload: JwtPayload) {
  const key = getKey();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .sign(key);
}

export async function verifyAuthToken(token: string) {
  const key = getKey();
  const { payload } = await jwtVerify<JwtPayload>(token, key, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  return payload;
}

export function authCookie(token: string) {
  const maxAge = TOKEN_TTL_SECONDS;
  const secure = process.env.NODE_ENV === "production";
  return `auth_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge};${
    secure ? " Secure;" : ""
  }`;
}

