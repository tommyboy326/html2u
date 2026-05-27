import type { MetadataRoute } from "next";

// Keep the whole app out of search engines — it only hosts private shares.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
