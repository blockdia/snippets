export function publicPageHeaders() {
  return {
    "Cache-Control":
      "public, max-age=30, s-maxage=300, stale-while-revalidate=86400",
  };
}
