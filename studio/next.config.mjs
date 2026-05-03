/** @type {import('next').NextConfig} */
const nextConfig = {
<<<<<<< HEAD
=======
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "*.fremio.id",
      },
    ],
  },
  // Socket.io requires custom server — disable static export
  experimental: {
    serverComponentsExternalPackages: ["bcryptjs", "@prisma/client"],
  },
};

export default nextConfig;
