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

    let event: any;
    try {
      event = JSON.parse(body);
    } catch (e) {
      return new Response("Malformed JSON", { status: 400 });
    }

    if (!event || typeof event !== "object" || !event.event || !event.data) {
      return new Response("Malformed event", { status: 400 });
    }

    const eventId = event.id ?? `${event.event}:${event.data?.reference ?? Math.random().toString(36).slice(2)}`;

    // route processing to a single idempotent handler
    try {
      await ctx.runMutation(internal.paystack.processWebhookEvent, {
        eventId,
        eventName: event.event,
        data: event.data,
      });
    } catch (e) {
      // Log the error server-side (Convex events/logging recommended) and return 500 so Paystack can retry
      console.error('Webhook processing error', e);
      return new Response("Internal error", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  }),
});

export default http;
