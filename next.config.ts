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
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
  webpack: (config) => {
    // @privy-io/react-auth has an optional dependency on @solana-program/system
    // which in turn requires @solana/web3.js v2. Since we don't use Solana
    // features, stub the import to avoid the build failure.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@solana-program/system": false,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              `img-src 'self' data: blob: https://ui-avatars.com ${supabaseHostname ? `https://${supabaseHostname}` : "https://*.supabase.co"}`,
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://auth.privy.io https://*.upstash.io",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
