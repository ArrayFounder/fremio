"use client";
// AuthContext adapter — bridges next-auth session to fremio useAuth() hook
import React, { createContext, useContext } from "react";
import { useSession } from "next-auth/react";

const AuthContext = createContext({ user: null });

export function AuthProvider({ children }) {
  const { data: session } = useSession();
  const user = session?.user
    ? {
        uid: session.user.id ?? session.user.email,
        email: session.user.email ?? "",
        name: session.user.name ?? "",
        role: session.user.role ?? "operator",
        // properties expected by Create.jsx
        isAnonymous: false,
      }
    : null;

  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
