const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const TIMEOUT_MS = 5000;

export async function onRequestGet(context) {
  const url = context.request.url ? new URL(context.request.url).searchParams.get("url") : null;
  if (!url) return json({ working: false, error: "missing_url" }, 400);

  let target;
  try {
    target = new URL(url);
  } catch {
    return json({ working: false, error: "invalid_url" }, 400);
  }
  if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
    return json({ working: false, error: "unsupported_protocol" }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: {
        Range: "bytes=0-255",
        "User-Agent": "seurat.fi-stream-check/1.0"
      },
      redirect: "follow",
      signal: controller.signal
    });
    const prefix = new Uint8Array(await response.arrayBuffer());
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const working = response.ok && (contentType.includes("audio/") || contentType.includes("mpegurl") || hasAudioPrefix(prefix));
    return json({ working, status: response.status, contentType });
  } catch {
    return json({ working: false, error: "request_failed" });
  } finally {
    clearTimeout(timeout);
  }
}

function hasAudioPrefix(bytes) {
  const text = new TextDecoder().decode(bytes.slice(0, 16));
  return text.startsWith("ID3") || text.startsWith("OggS") || text.startsWith("fLaC") || text.startsWith("#EXTM3U");
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store"
    }
  });
}
