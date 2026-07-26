import { createRequire } from 'node:module';

// Single source of truth for the app version: the repo-root package.json that
// semantic-release bumps (and the README release badge tracks). Surfaced to the
// client as NEXT_PUBLIC_APP_VERSION and rendered in the footer.
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_APP_VERSION: version },
  transpilePackages: ['@noxoracle/confidential-ctf'],
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    };
    // Resolve the TS package's ESM-style ".js" imports to their ".ts" sources.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};
export default nextConfig;
