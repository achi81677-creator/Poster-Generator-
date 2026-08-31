/** @type {import('next').NextConfig} */
const nextConfig = {
  // sharp und resvg sind native Module und dürfen nicht gebundelt werden
  experimental: {
    serverComponentsExternalPackages: ["sharp", "@resvg/resvg-js"],
  },
};

export default nextConfig;
