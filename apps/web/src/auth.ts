import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

/**
 * Auth.js v5 configuration with Discord OAuth.
 *
 * Required env vars (set in .env.local or Vercel):
 *   AUTH_SECRET            — random 32+ char string (`openssl rand -base64 32`)
 *   AUTH_DISCORD_ID        — Discord Application ID
 *   AUTH_DISCORD_SECRET    — Discord OAuth Secret (Developer Portal → OAuth2 → Reset Secret)
 *
 * Add this redirect URI to your Discord app's OAuth2 settings:
 *   http://localhost:3000/api/auth/callback/discord   (dev)
 *   https://<your-domain>/api/auth/callback/discord   (prod)
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Discord({
      authorization: {
        params: {
          // identify: basic user info, guilds: list of guilds the user is in
          scope: "identify guilds",
        },
      },
    }),
  ],
  // JWT session — no DB required for sessions, faster initial setup.
  // (Auth.js writes a signed JWT cookie; user info & guild list lives there.)
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // On first sign-in, capture Discord-specific data we want in the session
      if (account && profile) {
        token.discordId = profile.id;
        token.username = profile.username as string | undefined;
        token.avatar = profile.avatar as string | null | undefined;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose discordId on session.user for use in server components / API routes
      if (session.user) {
        (session.user as { discordId?: string }).discordId = token.discordId as string | undefined;
      }
      return session;
    },
  },
  pages: {
    // Use built-in Auth.js pages for sign-in. Override later if custom design needed.
  },
});

export function isAuthConfigured(): boolean {
  return Boolean(process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET && process.env.AUTH_SECRET);
}
