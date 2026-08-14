import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha512(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

http.route({
  path: "/paystack/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return new Response("Webhook not configured", { status: 500 });
    const body = await request.text();
    const signature = request.headers.get("x-paystack-signature") ?? "";
    const expected = await hmacSha512(secret, body);
    if (!timingSafeEqualHex(signature.toLowerCase(), expected)) return new Response("Invalid signature", { status: 401 });

    const event = JSON.parse(body) as {
      event?: string;
      data?: { reference?: string; amount?: number; currency?: string; status?: string };
    };
    if (event.event === "charge.success" && event.data?.reference) {
      if (event.data.currency && event.data.currency !== "NGN") return new Response("Unsupported currency", { status: 400 });
      await ctx.runMutation(internal.paystack.applyWebhookPayment, {
        reference: event.data.reference,
        amountKobo: Number(event.data.amount ?? 0),
        successful: event.data.status === "success",
      });
    }
    return new Response("OK", { status: 200 });
  }),
});

export default http;
