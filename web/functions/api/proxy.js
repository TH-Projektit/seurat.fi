const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export async function proxyStream(value, origin, request) {
  let target;
  try {
    target = new URL(value);
  } catch {
    return response("Invalid stream URL", 400);
  }

  if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
    return response("Unsupported stream protocol", 400);
  }

  try {
    const requestHeaders = new Headers({ "User-Agent": "seurat.fi-stream-proxy/1.0" });
    for (const name of ["accept", "range"]) {
      const value = request?.headers.get(name);
      if (value) requestHeaders.set(name, value);
    }
    const upstream = await fetch(target, {
      headers: requestHeaders,
      redirect: "follow"
    });
    if (!upstream.ok) return response(`Upstream stream returned ${upstream.status}`, upstream.status);

    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("mpegurl") || contentType.includes("m3u") || isPlaylist(target)) {
      const playlist = await upstream.text();
      return new Response(rewritePlaylist(playlist, target, origin), {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") || "application/vnd.apple.mpegurl",
          "cache-control": "no-store"
        }
      });
    }

    const headers = new Headers();
    for (const name of ["content-type", "content-length", "accept-ranges", "content-range", "icy-br", "icy-description", "icy-genre", "icy-name", "icy-url"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("cache-control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return response("Unable to fetch stream", 502);
  }
}

function rewritePlaylist(playlist, playlistUrl, origin) {
  const proxy = (value) => `${origin}/api/proxy?url=${encodeURIComponent(new URL(value, playlistUrl).href)}`;
  return playlist
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_match, value) => `URI="${proxy(value)}"`);
      }
      return proxy(trimmed);
    })
    .join("\n");
}

function isPlaylist(url) {
  return /\.m3u8?(?:[?#]|$)/i.test(url.pathname);
}

function response(message, status) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
  });
}