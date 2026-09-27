/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@arta/rbac'],
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    return [
      // Engine.io exige la barra final que Next quita al reescribir (en producción Traefik va directo al API).
      { source: '/api/socket.io', destination: `${api}/socket.io/` },
      { source: '/api/:path*', destination: `${api}/:path*` },
      { source: '/uploads/:path*', destination: `${api}/uploads/:path*` },
    ];
  },
};

module.exports = nextConfig;
