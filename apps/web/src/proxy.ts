import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

// Public: the sign-in page and Convex Auth's own token-sync API route.
const isPublic = createRouteMatcher(["/auth/signin", "/api/auth"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (!isPublic(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/auth/signin");
  }
});

export const config = {
  // Unlike the NextAuth matcher this must INCLUDE /api/auth (the middleware
  // proxies Convex Auth actions through it). api/cron keeps its bearer secret.
  matcher: [
    "/((?!api/cron|_next/static|_next/image|favicon.ico|brand/|icons/).*)",
  ],
};
