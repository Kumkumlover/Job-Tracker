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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
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
      select: { id: true, email: true, name: true },
    });
    return user;
  }

  // Fall back to session (for web app)
  const { getServerSession } = await import("next-auth");
  const session = await getServerSession(authOptions);
  if (session?.user) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      select: { id: true, email: true, name: true },
    });
    return user;
  }

  return null;
}
