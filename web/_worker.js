import { checkStream } from "./functions/api/check.js";
import { proxyStream } from "./functions/api/proxy.js";
import { getStreams } from "./functions/api/streams.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/check") {
      return checkStream(url.searchParams.get("url"));
    }

    if (url.pathname === "/api/proxy") {
      return proxyStream(url.searchParams.get("url"), url.origin, request);
    }

    if (url.pathname === "/api/streams") {
      return getStreams();
    }

    return env.ASSETS.fetch(request);
  }
};