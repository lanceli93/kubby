import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

// Lightweight config for middleware (no DB imports)
export const authConfig: NextAuthConfig = {
  providers: [
    // Stub provider for middleware - actual authorize logic is in auth.ts
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
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      const publicPaths = ["/login", "/register", "/api/users", "/api/auth", "/setup", "/api/setup", "/api/filesystem"];
      const isPublic = publicPaths.some((p) => pathname.startsWith(p));

      if (isPublic) return true;
      if (!isLoggedIn) return false;

      // Admin routes
      if (pathname.startsWith("/dashboard")) {
        return !!(auth?.user as { isAdmin?: boolean })?.isAdmin;
      }

      return true;
    },
  },
  pages: {
    signIn: "/login",
  },
};
