// This is a local capability check only: GET never launches the xhs CLI.
import { MODEL_TIMEOUT_MS } from "../shared/modelTiming.mjs";
import { APP_ID } from "../shared/branding.mjs";
import { ACCOUNT_PROFILE_VERSION } from "../shared/accountIdentity.mjs";

export async function supportsCurrentModelTiming(baseUrl, request = fetch) {
  try {
    const response = await request(new URL("/api/runtime", baseUrl), { method: "GET", signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const data = await response.json();
    return data.ok === true && data.app === APP_ID && data.modelTimeoutMs === MODEL_TIMEOUT_MS && data.accountProfileVersion === ACCOUNT_PROFILE_VERSION;
  } catch { return false; }
}

export async function supportsNoteReading(baseUrl, request = fetch) {
  return supportsRoute(baseUrl, "/api/xhs/read", request);
}
export async function supportsAccountProfiles(baseUrl, request = fetch) {
  return supportsRoute(baseUrl, "/api/xhs/account/profile", request);
}
async function supportsRoute(baseUrl, path, request) {
  try {
    const response = await request(new URL(path, baseUrl), {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    if (response.status !== 405) return false;
    const result = await response.json();
    return result?.code === "METHOD_NOT_ALLOWED";
  } catch {
    return false;
  }
}
