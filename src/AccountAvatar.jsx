import { useState } from "react";
import { accountDisplayName, publicAvatarUrl } from "../shared/accountIdentity.mjs";

export function AccountAvatar({ profile }) {
  const url = publicAvatarUrl(profile?.avatarUrl);
  const identity = `${profile?.userId || ""}:${url}:${profile?.fetchedAt || ""}`;
  const [failed, setFailed] = useState("");
  const name = accountDisplayName(profile);
  if (url && failed !== identity) return <img key={identity} className="account-avatar" src={url} alt={`${name}的小红书头像`} referrerPolicy="no-referrer" onError={() => setFailed(identity)} />;
  const message = profile?.userId ? "头像未获取或加载失败，可重新读取账号资料" : "连接账号后显示小红书头像";
  return <span className="account-avatar account-avatar-placeholder" role="img" aria-label={message} title={message}>{profile?.nickname?.trim().slice(0, 1) || "人"}</span>;
}
