/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    reactCompiler: true,
    // Next 15 RC fails the build if a page reads searchParams without Suspense;
    // these pages are dynamic anyway.
    missingSuspenseWithCSRBailout: false,
  },
  webpack: (config, { dev, isServer, webpack, nextRuntime }) => {
    config.module.rules.push({
      test: /\.node$/,
      use: [
        {
          loader: "nextjs-node-loader",
          options: {
            // flags: os.constants.dlopen.RTLD_NOW,
            outputPath: config.output.path,
          },
        },
      ],
    });
    return config;
  },
};

module.exports = nextConfig;
