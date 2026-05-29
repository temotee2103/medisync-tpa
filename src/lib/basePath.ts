export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const withBasePath = (assetPath: string) => {
  if (!assetPath.startsWith("/")) return `${BASE_PATH}/${assetPath}`.replace(/\/{2,}/g, "/");
  return `${BASE_PATH}${assetPath}` || assetPath;
};
