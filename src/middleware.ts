import NextAuth from "next-auth";
import { authConfig } from "@/platform/auth/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

// Public: the landing page (exact "/" — it links into the app but reads no
// data) and the sign-in page.
const PUBLIC_PATHS = new Set(["/", "/auth/signin"]);

export default auth((req) => {
  if (!req.auth && !PUBLIC_PATHS.has(req.nextUrl.pathname)) {
    const signInUrl = new URL("/auth/signin", req.url);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
});

export const config = {
  // The Open Graph and Twitter card images skip the middleware entirely —
  // link preview crawlers fetch them without a session.
  matcher: ["/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|brand/|icons/|opengraph-image|twitter-image).*)"],
};
