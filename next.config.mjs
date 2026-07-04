/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "shop-phinf.pstatic.net",
      },
    ],
  },
};

export default nextConfig;
