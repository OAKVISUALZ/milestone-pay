/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@milestone-pay/shared", "@milestone-pay/sdk"],
};

export default nextConfig;
