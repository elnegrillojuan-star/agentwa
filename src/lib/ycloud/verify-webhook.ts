import { createHmac, timingSafeEqual } from "node:crypto";

// YCloud signs webhooks as `YCloud-Signature: t=<unix seconds>,s=<hex hmac>`,
// where the hmac is HMAC-SHA256(`${t}.${rawBody}`, webhookSecret). Must run
// against the raw request body, before any JSON.parse.
export function verifyYCloudSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.s;
  if (!timestamp || !signature) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
