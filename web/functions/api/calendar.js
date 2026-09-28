const CALENDAR_API = "https://d1idlmpl427mpk.cloudfront.net/api/parser";
const CALENDAR_IDS = new Map([
  ["kempeleen rauhanyhdistys", 18],
  ["kouvolan rauhanyhdistys", 163]
]);

export async function addNextEvents(channels) {
  return Promise.all(channels.map(async (channel) => {
    const calendarId = CALENDAR_IDS.get(normalize(channel.name));
    if (!calendarId) return channel;

    try {
      const response = await fetch(`${CALENDAR_API}/${calendarId}.json`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "seurat.fi-stream-proxy/1.0"
        }
      });
      if (!response.ok) return channel;

      const data = await response.json();
      const now = Date.now();
      const nextEvent = (data.events ?? [])
        .filter((event) => event.web_stream_available && Number(event.end) >= now)
        .sort((a, b) => a.start - b.start)[0];
      return nextEvent ? { ...channel, nextEvent: toEvent(nextEvent) } : channel;
    } catch {
      return channel;
    }
  }));
}

function toEvent(event) {
  return {
    name: event.name,
    start: event.start,
    end: event.end,
    place: event.place_formatted || event.place || ""
  };
}

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/\s+ry\.?$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
