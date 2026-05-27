import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAdminEmail } from "@/lib/config";

// Google (Gmail) login for the admin dashboard. The signIn callback enforces
// the ADMIN_EMAILS allowlist: anyone NOT on the list is rejected at sign-in, so
// a valid session always means an authorized admin.
//
// Reads AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET from the environment.
export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [Google],
  callbacks: {
    signIn({ user }) {
      return isAdminEmail(user.email);
    },
  },
  pages: {
    signIn: "/admin",
    error: "/admin", // denied logins land back on /admin (?error=...)
  },
});
