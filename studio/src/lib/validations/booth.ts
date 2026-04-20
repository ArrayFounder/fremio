import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Booth Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const createBoothSchema = z.object({
  name: z
    .string({ required_error: "Nama booth wajib diisi" })
    .min(2, "Nama booth minimal 2 karakter")
    .trim(),
  slug: z
    .string({ required_error: "Slug wajib diisi" })
    .min(3, "Slug minimal 3 karakter")
    .max(50, "Slug maksimal 50 karakter")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug hanya boleh mengandung huruf kecil, angka, dan tanda hubung"
    ),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Format warna tidak valid (contoh: #0a1a4a)")
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Format warna tidak valid (contoh: #d4a017)")
    .optional(),
});

export const updateBoothSchema = createBoothSchema.partial();

export type CreateBoothInput = z.infer<typeof createBoothSchema>;
export type UpdateBoothInput = z.infer<typeof updateBoothSchema>;
