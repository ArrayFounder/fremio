import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Route handler untuk semua NextAuth endpoints:
// GET/POST /api/auth/signin, /api/auth/signout, /api/auth/session, dll.
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
