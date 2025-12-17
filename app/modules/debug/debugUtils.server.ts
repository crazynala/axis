export function getDebugVersion(): string {
  return (
    process.env.GIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    "dev"
  );
}

export function capArray<T>(arr: T[], limit = 200) {
  if (arr.length <= limit) return { items: arr, truncated: false };
  return { items: arr.slice(0, limit), truncated: true };
}
