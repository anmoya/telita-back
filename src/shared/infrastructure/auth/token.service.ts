import { createHmac, timingSafeEqual } from "node:crypto";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  role: "superadmin" | "admin" | "operador";
  iat: number;
  exp: number;
};

export class TokenService {
  constructor(private readonly secret: string) {}

  sign(payload: Omit<AuthTokenPayload, "iat" | "exp">, expiresInSeconds = 60 * 60 * 12): string {
    const now = Math.floor(Date.now() / 1000);
    const body: AuthTokenPayload = {
      ...payload,
      iat: now,
      exp: now + expiresInSeconds
    };
    const encoded = encode(body);
    const sig = signPart(encoded, this.secret);
    return `${encoded}.${sig}`;
  }

  verify(token: string): AuthTokenPayload {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) throw new Error("Invalid token format");

    const expected = signPart(encoded, this.secret);
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      throw new Error("Invalid token signature");
    }

    const payload = decode<AuthTokenPayload>(encoded);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) throw new Error("Token expired");
    return payload;
  }
}

function encode<T>(value: T): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64url");
}

function decode<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf-8")) as T;
}

function signPart(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}
