import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ico|webp|avif|woff2?|ttf|map|txt|xml|pdf|zip)).*)",
  ],
};
