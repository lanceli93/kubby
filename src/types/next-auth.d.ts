import "next-auth";

declare module "next-auth" {
  interface User {
    isAdmin?: boolean;
    locale?: string;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      isAdmin: boolean;
      locale: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    isAdmin: boolean;
    locale: string;
  }
}
