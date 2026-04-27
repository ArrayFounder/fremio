"use client";
import { SessionProvider } from "next-auth/react";
import { AuthProvider } from "@/contexts/AuthContext";
import CreateStudio from "./CreateStudio";

export default function FrameEditorPage() {
  return (
    <SessionProvider>
      <AuthProvider>
        <CreateStudio />
      </AuthProvider>
    </SessionProvider>
  );
}
