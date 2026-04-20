import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Middleware — Proteksi route dashboard
// Semua route di /dashboard/* wajib login
// Route /booth/* adalah publik (diakses customer tanpa auth)
// ─────────────────────────────────────────────────────────────────────────────

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Redirect ke login jika belum auth dan akses dashboard
    if (pathname.startsWith("/dashboard") && !token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Booth page dan landing page tidak butuh auth
        if (
          req.nextUrl.pathname.startsWith("/b/") ||
          req.nextUrl.pathname === "/" ||
          req.nextUrl.pathname.startsWith("/api/webhooks/") ||
          // Payment routes: create + webhook + status polling — semua publik (booth UI)
          req.nextUrl.pathname.startsWith("/api/payment/")
        ) {
          return true;
        }
        // Semua dashboard route butuh token
        if (req.nextUrl.pathname.startsWith("/dashboard")) {
          return !!token;
        }
        return true;
      },
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/booth/:path*",
    "/api/frames/:path*",
    "/api/sessions/:path*",
    "/api/photos/:path*",
    // payment routes di-exclude dari matcher sehingga TIDAK melewati withAuth
    // (sudah dihandle di authorized callback di atas)
  ],
};
