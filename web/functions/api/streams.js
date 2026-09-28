import { checkStream } from "./check.js";
import { addNextEvents } from "./calendar.js";

const FIRESTORE_URL = "https://firestore.googleapis.com/v1/projects/nettiseurat-f3e09/databases/(default)/documents/publicStreams";
const CHECK_CONCURRENCY = 4;

export async function getStreams() {
  const response = await fetch(FIRESTORE_URL, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    return json({ error: "firestore_request_failed" }, 502);
  }

  const documents = (await response.json()).documents ?? [];
  const channels = documents
    .map(parseChannel)
    .filter((channel) => channel.enabled && channel.name && channel.streams.length);
  const checkedChannels = await checkChannels(channels);
  const workingChannels = checkedChannels
    .map((channel) => ({
      ...channel,
      streams: channel.streams.filter((stream) => stream.working)
    }))
    .filter((channel) => channel.streams.length);

  const channelsWithEvents = await addNextEvents(workingChannels);
  return json(channelsWithEvents.sort((a, b) => a.name.localeCompare(b.name, "fi")), 200);
}

async function checkChannels(channels) {
  let nextIndex = 0;
  const checked = [];

  async function checkNext() {
    while (nextIndex < channels.length) {
      const channel = channels[nextIndex++];
      const streams = await Promise.all(channel.streams.map(async (stream) => ({
        ...stream,
        working: await isWorking(stream.url)
      })));
      checked.push({ ...channel, streams });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, channels.length) }, checkNext));
  return checked;
}

async function isWorking(url) {
  try {
    const response = await checkStream(url);
    if (!response.ok) return false;
    return Boolean((await response.json()).working);
  } catch {
    return false;
  }
}

function parseChannel(document) {
  const fields = document.fields ?? {};
  const nestedStreams = (fields.streams?.arrayValue?.values ?? []).map((item) => {
    const stream = item.mapValue?.fields ?? {};
    return { label: firestoreValue(stream.label) || "Live", url: firestoreValue(stream.url).trim() };
  }).filter((stream) => stream.url);
  const fallback = firestoreValue(fields.url).trim();

  return {
    id: document.name.split("/").pop(),
    name: firestoreValue(fields.name).trim(),
    location: firestoreValue(fields.location).trim(),
    enabled: fields.enabled?.booleanValue !== false,
    streams: nestedStreams.length ? nestedStreams : (fallback ? [{ label: "Live", url: fallback }] : [])
  };
}

function firestoreValue(value) {
  if (!value) return "";
  return value.stringValue ?? value.booleanValue ?? value.integerValue ?? "";
}

function json(value, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store"
    }
  });
}
