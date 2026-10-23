import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const API = process.env.NULLCORD_API_URL ?? "http://127.0.0.1:14702";
const OWNER_ID = process.env.PLATFORM_ACCOUNT_ID;

/**
 * Authenticate against the NullCord API and only allow platform admins in.
 *
 * The panel has direct database access, so a normal user session must never
 * be enough to reach /panel.
 */
export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "NullCord",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const login = await fetch(`${API}/auth/session/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
            cache: "no-store",
          });
          if (!login.ok) return null;

          const session = (await login.json()) as { token?: string };
          if (!session.token) return null;

          const me = await fetch(`${API}/users/@me`, {
            headers: { "x-session-token": session.token },
            cache: "no-store",
          });
          if (!me.ok) return null;

          const user = (await me.json()) as {
            _id: string;
            username: string;
            discriminator: string;
            privileged?: boolean;
          };

          const isAdmin =
            user.privileged === true ||
            (OWNER_ID ? user._id === OWNER_ID : false);

          if (!isAdmin) return null;

          return {
            id: user._id,
            name: `${user.username}#${user.discriminator}`,
            email: credentials.email,
            image: null,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  jwt: {
    maxAge: 2 * 60 * 60, // 2 hours
  },
  pages: {
    signIn: "/",
  },
};
