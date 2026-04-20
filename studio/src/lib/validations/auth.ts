import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Auth Validation Schemas (Zod)
// Digunakan di API routes dan credentials provider NextAuth
// ─────────────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string({ required_error: "Email wajib diisi" })
    .email("Format email tidak valid")
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: "Password wajib diisi" })
    .min(8, "Password minimal 8 karakter"),
});

export const registerSchema = z.object({
  email: z
    .string({ required_error: "Email wajib diisi" })
    .email("Format email tidak valid")
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: "Password wajib diisi" })
    .min(8, "Password minimal 8 karakter")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password harus mengandung huruf besar, huruf kecil, dan angka"
    ),
  name: z
    .string({ required_error: "Nama wajib diisi" })
    .min(2, "Nama minimal 2 karakter")
    .trim(),
  businessName: z
    .string({ required_error: "Nama bisnis wajib diisi" })
    .min(2, "Nama bisnis minimal 2 karakter")
    .trim(),
  phone: z
    .string()
    .regex(/^(\+62|08)\d{8,12}$/, "Format nomor telepon tidak valid")
    .optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
