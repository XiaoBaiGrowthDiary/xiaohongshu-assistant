// This is a local capability check only: GET never launches the xhs CLI.
export async function supportsNoteReading(baseUrl, request = fetch) {
  try {
    const response = await request(new URL("/api/xhs/read", baseUrl), {
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
