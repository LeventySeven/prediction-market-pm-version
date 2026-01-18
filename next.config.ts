import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";

const supabaseHostname = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
})();

const remotePatterns: RemotePattern[] = [
  {
    protocol: "https" as const,
    hostname: "ui-avatars.com",
  },
  ...(supabaseHostname
    ? [
        {
          protocol: "https" as const,
          hostname: supabaseHostname,
          pathname: "/storage/v1/object/public/**",
        },
      ]
    : process.env.NODE_ENV === "production"
      ? []
      : [
          // Dev fallback to avoid breaking local previews if env isn't set.
          {
            protocol: "https" as const,
            hostname: "*.supabase.co",
            pathname: "/storage/v1/object/public/**",
          },
        ]),
];

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns,
  },
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};

export default nextConfig;
