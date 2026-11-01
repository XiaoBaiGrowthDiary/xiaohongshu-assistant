export const ACCOUNT_PROFILE_VERSION = 2;

export function accountDisplayName(profile) {
  return typeof profile?.nickname === "string" && profile.nickname.trim() ? profile.nickname.trim() : profile?.userId ? "已连接账号" : "未连接账号";
}

// Only public platform image hosts are accepted. No server image proxy or
// browser credentials are needed to display a returned avatar.
export function publicAvatarUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return "";
  try {
    const url = new URL(value.trim().startsWith("//") ? `https:${value.trim()}` : value.trim());
    const host = url.hostname.toLowerCase();
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) return "";
    if (!(host === "xhscdn.com" || host.endsWith(".xhscdn.com") || host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com"))) return "";
    if ([...url.searchParams.keys()].some((key) => /^(?:xsec_token|cookie|authorization|access_token|session|a1)$/i.test(key))) return "";
    url.protocol = "https:";
    url.hash = "";
    return url.toString();
  } catch { return ""; }
}
