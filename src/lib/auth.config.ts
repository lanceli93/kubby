import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

// Lightweight config for proxy (no DB imports)
export const authConfig: NextAuthConfig = {
  providers: [
    // Stub provider for proxy - actual authorize logic is in auth.ts
    Credentials({
      credentials: {
        username: {},
        password: {},
      },
      authorize: () => null,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin;
        token.locale = (user as { locale?: string }).locale || "en";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { isAdmin?: boolean }).isAdmin = token.isAdmin as boolean;
        (session.user as { locale?: string }).locale = token.locale as string;
      }
      return session;
    },
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      const publicPaths = ["/login", "/register", "/api/users", "/api/auth", "/setup", "/api/setup", "/api/filesystem"];
      const isPublic = publicPaths.some((p) => pathname.startsWith(p))
        || /^\/api\/movies\/[^/]+\/stream\/?$/.test(pathname);

      if (isPublic) return true;
      if (!isLoggedIn) return false;

      // Admin routes — redirect non-admin to home (not login, to avoid loop)
      if (pathname.startsWith("/dashboard")) {
        const isAdmin = !!(auth?.user as { isAdmin?: boolean })?.isAdmin;
        if (!isAdmin) {
          return Response.redirect(new URL("/", nextUrl));
        }
      }

      // Remember last visited domain (cinema vs photos vs music) — if the user
      // was last in the photos or music domain, jump straight there from the
      // root so reopening the site has zero flash of the cinema homepage. Only
      // for direct entry (address bar / bookmark → Sec-Fetch-Site: none):
      // in-app links to "/" (logo, Home, cinema pill) are same-origin requests
      // and must land on the cinema home, not bounce back to /photos or /music.
      if (
        pathname === "/" &&
        request.headers.get("sec-fetch-site") === "none"
      ) {
        const dom = request.cookies.get("kubby-domain")?.value;
        if (dom === "photos") return Response.redirect(new URL("/photos", nextUrl));
        if (dom === "music") return Response.redirect(new URL("/music", nextUrl));
      }

      return true;
    },
  },
  pages: {
    signIn: "/login",
  },
};
