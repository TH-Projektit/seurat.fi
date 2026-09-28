const state = { channels: [] };
let activeCard = null;
let activeAudio = null;
let activeHls = null;
let activeStreamUrls = [];
let activeStreamIndex = 0;

const grid = document.querySelector("#channel-grid");
const status = document.querySelector("#status-message");
const count = document.querySelector("#result-count");
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

async function loadChannels() {
  status.textContent = "Ladataan lähetyksiä...";
  try {
    const response = await fetch("/api/streams");
    if (!response.ok) throw new Error(`Streams API ${response.status}`);
    state.channels = await response.json();
    render();
  } catch (error) {
    console.error(error);
    status.textContent = "Seurojen lataus epäonnistui. Yritä hetken päästä uudelleen.";
    grid.replaceChildren();
    count.textContent = "-";
  }
}

function isPlaylistUrl(url) {
  return /\.m3u8?(?:[?#]|$)/i.test(url);
}

function playbackUrl(url) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

function render() {
  const filtered = state.channels;
  count.textContent = `${filtered.length} ${filtered.length === 1 ? "seura" : "seuraa"}`;
  status.textContent = filtered.length ? "" : "Yhtään seuraa ei löytynyt näillä hakuehdoilla.";
  grid.replaceChildren(...filtered.map(channelCard));
  renderNextEvents(filtered);
}

function renderNextEvents(channels) {
  const existing = document.querySelector(".next-events");
  if (existing) existing.remove();
  const events = channels
    .filter((channel) => channel.nextEvent)
    .map((channel) => ({ ...channel.nextEvent, channel: channel.name }))
    .sort((a, b) => a.start - b.start);
  if (!events.length) return;

  const section = document.createElement("section");
  section.className = "next-events";
  section.innerHTML = '<div class="next-events-heading"><span class="section-kicker">SEURAAVAT SEURAT</span></div><div class="next-events-list"></div>';
  const list = section.querySelector(".next-events-list");
  for (const event of events) {
    const item = document.createElement("div");
    item.className = "next-event";
    const date = new Date(event.start);
    const weekday = new Intl.DateTimeFormat("fi-FI", { weekday: "short" }).format(date).replace(/\.$/, "");
    const time = new Intl.DateTimeFormat("fi-FI", { hour: "numeric", minute: "2-digit" }).format(date);
    item.innerHTML = `<time datetime="${date.toISOString()}"><strong>${weekday}</strong><span>klo ${time}</span></time><div><strong class="next-event-name"></strong><span class="next-event-place"></span></div>`;
    item.querySelector(".next-event-name").textContent = event.channel;
    item.querySelector(".next-event-place").textContent = event.name + (event.place ? ` · ${event.place}` : "");
    list.append(item);
  }
  grid.before(section);
}

function channelCard(channel) {
  const card = document.createElement("article");
  card.className = "channel-card";
  const working = channel.streams.some((stream) => stream.working);
  card.innerHTML = `<span class="channel-status" aria-label="${working ? "Lähetys saatavilla" : "Lähetys ei vastaa"}"></span><div class="channel-details"><h3 class="channel-name"></h3><div class="channel-location"></div><div class="inline-player" hidden><audio controls preload="auto" playsinline></audio></div></div><button class="play-button" type="button">Kuuntele</button>`;
  if (!working) card.classList.add("is-offline");
  card.querySelector(".channel-name").textContent = channel.name;
  card.querySelector(".channel-location").textContent = channel.location;
  card.querySelector(".play-button").addEventListener("click", () => toggleInlinePlayer(card, channel));
  return card;
}

function toggleInlinePlayer(card, channel) {
  const button = card.querySelector(".play-button");
  const player = card.querySelector(".inline-player");
  const audio = player.querySelector("audio");

  if (activeCard === card) {
    activeAudio.pause();
    if (activeHls) {
      activeHls.destroy();
      activeHls = null;
    }
    player.hidden = true;
    card.classList.remove("is-playing");
    button.textContent = "Kuuntele";
    activeCard = null;
    activeAudio = null;
    activeStreamUrls = [];
    activeStreamIndex = 0;
    return;
  }

  if (activeAudio) {
    activeAudio.onerror = null;
    activeAudio.onplaying = null;
    activeAudio.pause();
  }
  if (activeHls) {
    activeHls.destroy();
    activeHls = null;
  }
  if (activeCard) {
    activeCard.classList.remove("is-playing");
    activeCard.querySelector(".inline-player").hidden = true;
    activeCard.querySelector(".play-button").textContent = "Kuuntele";
  }

  activeStreamUrls = channel.streams.map((stream) => playbackUrl(stream.url));
  activeStreamIndex = 0;
  player.hidden = false;
  card.classList.add("is-playing");
  button.textContent = "Pysäytä";
  activeCard = card;
  activeAudio = audio;
  audio.onplaying = null;
  const playCurrentStream = () => {
    const url = activeStreamUrls[activeStreamIndex];
    if (isPlaylistUrl(url) && window.Hls?.isSupported()) {
      activeHls = new window.Hls({ enableWorker: true });
      activeHls.on(window.Hls.Events.MANIFEST_PARSED, () => audio.play().catch(() => { }));
      activeHls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) tryNextStream();
      });
      activeHls.loadSource(url);
      activeHls.attachMedia(audio);
      return;
    }
    audio.src = url;
    audio.preload = "auto";
    audio.load();
    audio.play().catch(() => { });
  };
  const tryNextStream = () => {
    if (activeHls) {
      activeHls.destroy();
      activeHls = null;
    }
    activeStreamIndex += 1;
    if (activeStreamIndex < activeStreamUrls.length) {
      playCurrentStream();
    } else {
      button.textContent = "Kuuntele";
    }
  };
  audio.onerror = tryNextStream;
  playCurrentStream();
}

loadChannels();
setInterval(loadChannels, REFRESH_INTERVAL_MS);