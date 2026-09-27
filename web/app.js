const FIRESTORE_URL = "https://firestore.googleapis.com/v1/projects/nettiseurat-f3e09/databases/(default)/documents/publicStreams";
const state = { channels: [] };
let activeCard = null;
let activeAudio = null;
let activeHls = null;
let activeStreamUrls = [];
let activeStreamIndex = 0;

const grid = document.querySelector("#channel-grid");
const status = document.querySelector("#status-message");
const count = document.querySelector("#result-count");
const STREAM_TEST_TIMEOUT_MS = 5000;
const STREAM_TEST_CONCURRENCY = 16;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function firestoreValue(value) {
  if (!value) return "";
  return value.stringValue ?? value.booleanValue ?? value.integerValue ?? "";
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

async function loadChannels() {
  status.textContent = "Ladataan lähetyksiä...";
  try {
    const response = await fetch(FIRESTORE_URL);
    if (!response.ok) throw new Error(`Firestore ${response.status}`);
    const channels = (await response.json()).documents?.map(parseChannel).filter((channel) => channel.enabled && channel.name && channel.streams.length).sort((a, b) => a.name.localeCompare(b.name, "fi")) ?? [];
    state.channels = await workingChannels(channels);
    render();
  } catch (error) {
    console.error(error);
    status.textContent = "Seurojen lataus epäonnistui. Yritä hetken päästä uudelleen.";
    grid.replaceChildren();
    count.textContent = "-";
  }
}

async function workingChannels(channels) {
  const working = [];
  let nextIndex = 0;

  async function testNext() {
    while (nextIndex < channels.length) {
      const channel = channels[nextIndex++];
      const streams = [];
      for (const stream of channel.streams) {
        if (await testsAsAudio(stream.url)) streams.push(stream);
      }
      if (streams.length) working.push({ ...channel, streams });
    }
  }

  await Promise.all(Array.from({ length: Math.min(STREAM_TEST_CONCURRENCY, channels.length) }, testNext));
  return working.sort((a, b) => a.name.localeCompare(b.name, "fi"));
}

function testsAsAudio(url) {
  return testsWithServer(url).then((serverResult) => {
    if (serverResult !== null) return serverResult;
    return testsWithBrowserAudio(url);
  });
}

async function testsWithServer(url) {
  try {
    const response = await fetch(`/api/check?url=${encodeURIComponent(url)}`);
    if (response.status === 404) return null;
    if (!response.ok) return false;
    return Boolean((await response.json()).working);
  } catch {
    return null;
  }
}

function testsWithBrowserAudio(url) {
  if (isPlaylistUrl(url) && window.Hls?.isSupported()) return testsAsHls(url);
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      resolve(result);
    };
    const timeout = setTimeout(() => finish(false), STREAM_TEST_TIMEOUT_MS);
    audio.preload = "metadata";
    audio.muted = true;
    audio.addEventListener("canplay", () => finish(true), { once: true });
    audio.addEventListener("loadedmetadata", () => finish(true), { once: true });
    audio.addEventListener("playing", () => finish(true), { once: true });
    audio.addEventListener("error", () => finish(false), { once: true });
    audio.src = url;
    audio.load();
    audio.play().catch(() => { });
  });
}

function isPlaylistUrl(url) {
  return /\.m3u8?(?:[?#]|$)/i.test(url);
}

function testsAsHls(url) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const hls = new window.Hls({ enableWorker: true });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      hls.destroy();
      audio.pause();
      resolve(result);
    };
    const timeout = setTimeout(() => finish(false), STREAM_TEST_TIMEOUT_MS);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => finish(true));
    hls.on(window.Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) finish(false);
    });
    hls.loadSource(url);
    hls.attachMedia(audio);
  });
}

function render() {
  const filtered = state.channels;
  count.textContent = `${filtered.length} ${filtered.length === 1 ? "seura" : "seuraa"}`;
  status.textContent = filtered.length ? "" : "Yhtään seuraa ei löytynyt näillä hakuehdoilla.";
  grid.replaceChildren(...filtered.map(channelCard));
}

function channelCard(channel) {
  const card = document.createElement("article");
  card.className = "channel-card";
  card.innerHTML = `<span class="channel-status" aria-label="Lähetys saatavilla"></span><div class="channel-details"><h3 class="channel-name"></h3><div class="channel-location"></div><div class="inline-player" hidden><audio controls preload="auto" playsinline></audio></div></div><button class="play-button" type="button">Kuuntele</button>`;
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

  activeStreamUrls = channel.streams.map((stream) => stream.url);
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