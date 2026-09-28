const TIMEOUT_MS = 5000;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export async function checkStream(value) {
  if (!value) return json({ working: false, error: "missing_url" }, 400);

  let target;
  try {
    target = new URL(value);
  } catch {
    return json({ working: false, error: "invalid_url" }, 400);
  }

  if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
    return json({ working: false, error: "unsupported_protocol" }, 400);
  }

  try {
    const result = await inspectStream(target, 0);
    return json(result);
  } catch {
    return json({ working: false, error: "request_failed" });
  }
}

async function inspectStream(target, depth) {
  if (depth > 1) return { working: false, error: "playlist_too_deep" };

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
    const bytes = await readPrefix(response, 256);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!response.ok || !bytes.length) return { working: false, status: response.status, contentType };

    if (isPlaylist(contentType, target, bytes)) {
      const child = playlistTarget(bytes, target);
      if (!child) return { working: false, status: response.status, contentType };
      return inspectStream(child, depth + 1);
    }

    const working = isMediaContent(contentType) || hasAudioPrefix(bytes);
    return { working, status: response.status, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

function isPlaylist(contentType, target, bytes) {
  return contentType.includes("mpegurl") || contentType.includes("m3u") || /\.m3u8?(?:[?#]|$)/i.test(target.pathname) || hasPlaylistPrefix(bytes);
}

function playlistTarget(bytes, playlistUrl) {
  const lines = new TextDecoder().decode(bytes).split(/\r?\n/);
  const line = lines.find((value) => value.trim() && !value.trim().startsWith("#"));
  if (!line) return null;
  try {
    return new URL(line.trim(), playlistUrl);
  } catch {
    return null;
  }
}

function isMediaContent(contentType) {
  return contentType.includes("audio/") || contentType.includes("video/") || contentType.includes("ogg");
}

function hasPlaylistPrefix(bytes) {
  return new TextDecoder().decode(bytes.slice(0, 16)).startsWith("#EXTM3U");
}

async function readPrefix(response, limit) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const size = Math.min(chunk.length, bytes.length - offset);
    bytes.set(chunk.subarray(0, size), offset);
    offset += size;
    if (offset === bytes.length) break;
  }
  return bytes;
}

function hasAudioPrefix(bytes) {
  const text = new TextDecoder().decode(bytes.slice(0, 16));
  if (text.startsWith("ID3") || text.startsWith("OggS") || text.startsWith("fLaC") || text.startsWith("RIFF") || text.startsWith("#EXTM3U")) {
    return true;
  }
  return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
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
