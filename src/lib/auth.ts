import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import { DEFAULT_STAGES } from "./constants";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }
      // On every sign-in, update the stored OAuth tokens in the database
      // (NextAuth's PrismaAdapter doesn't update tokens on re-login by default)
      if (account && user) {
        await prisma.account.updateMany({
          where: { userId: user.id, provider: account.provider },
          data: {
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            expires_at: account.expires_at,
            token_type: account.token_type,
            scope: account.scope,
            id_token: account.id_token,
          },
        });
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        (session.user as { id: string }).id = token.id as string;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Seed default stages for new users
      await prisma.customStage.createMany({
        data: DEFAULT_STAGES.map((stage) => ({
          userId: user.id,
          ...stage,
        })),
      });
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};

// Get authenticated user from session or API key
export async function getAuthenticatedUser(request: Request) {
  // Check API key first (for extension)
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) {
    const user = await prisma.user.findUnique({
      where: { apiKey },
    });
    return user;
  }

  // Fall back to session (for web app)
  const { getServerSession } = await import("next-auth");
  const session = await getServerSession(authOptions);
  if (session?.user) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });
    return user;
  }

  return null;
}
