import { NextResponse } from "next/server";
import nextAuthMiddleware from "next-auth/middleware";

// With NEXT_PUBLIC_AUTH_TYPE=none the panel has no login provider; let
// requests through instead of bouncing them to the NextAuth sign-in page.
const middleware =
  process.env.NEXT_PUBLIC_AUTH_TYPE === "none"
    ? () => NextResponse.next()
    : nextAuthMiddleware;

export default middleware;

export const config = {
  matcher: ["/panel", "/panel/:path*"],
  pages: {
    signIn: "/",
  },
};
