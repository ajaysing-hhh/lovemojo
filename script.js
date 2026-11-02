const provider = window.supabaseRealtimeProvider;
const toast = document.querySelector(".toast");
let toastTimer;
const state = JSON.parse(localStorage.getItem("lovemojo-state") || '{"joined":false,"role":"lover"}');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.tab === tab));
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.toggle("active", screen.dataset.screen === tab));
}

function mergeNames(a, b) {
  const first = a.trim().replace(/\s+/g, "").toLowerCase();
  const second = b.trim().replace(/\s+/g, "").toLowerCase();
  const blend = `${first.slice(0, Math.ceil(first.length / 2))}${second.slice(Math.floor(second.length / 2))}`;
  return blend.toUpperCase();
}

function setOnline(online) {
  document.body.classList.toggle("joined", online || state.joined);
  document.querySelector(".presence-dot").classList.toggle("live", online);
  document.querySelector("#presence-copy").textContent = online ? "Both lovers are online" : state.joined ? "Your person is away" : "Waiting for your person";
}

function spawnReaction(emoji) {
  const particle = document.createElement("span");
  particle.className = "reaction-particle";
  particle.textContent = emoji;
  particle.style.left = `${20 + Math.random() * 60}%`;
  particle.style.top = `${35 + Math.random() * 40}%`;
  document.body.append(particle);
  setTimeout(() => particle.remove(), 2200);
}

async function saveMemory(event) {
  event.preventDefault();
  const payload = { note: document.querySelector("#memory-note").value.trim(), saved_for: document.querySelector("#memory-date").value };
  try { await provider.insert("memories", payload); } catch (error) { showToast(error.message || "Memory could not sync"); return; }
  document.querySelector("#memory-modal").close();
  addMemoryCard(payload);
  event.target.reset();
  showToast("Saved to both hearts");
}

function addMemoryCard(memory) {
  const card = document.createElement("button");
  card.className = "memory-card sample-memory";
  card.dataset.openMemory = "";
  card.innerHTML = `<span class="memory-date"></span><strong></strong><small>saved to both hearts</small>`;
  card.querySelector(".memory-date").textContent = memory.saved_for || "TODAY";
  card.querySelector("strong").textContent = memory.note;
  document.querySelector("#memory-grid").prepend(card);
  card.addEventListener("click", openMemory);
}

function openMemory() {
  const modal = document.querySelector("#memory-modal");
  if (typeof modal.showModal === "function") modal.showModal();
  else modal.setAttribute("open", "");
}

async function loadMemories() {
  if (!provider.client) return;
  try {
    const memories = await provider.select("memories");
    memories.forEach((memory) => addMemoryCard(memory));
  } catch (error) { showToast(error.message || "Memories could not load"); }
}

async function loadFeed() {
  if (!provider.client) return;
  try {
    const items = await provider.select("feed_items");
    const list = document.querySelector("#feed-list");
    items.reverse().forEach((item) => {
      const article = document.createElement("article");
      article.className = "feed-item";
      article.innerHTML = `<div class="feed-meta"><span>LIVE / COUPLE SIGNAL</span><time></time></div><h2></h2><p></p><div class="feed-actions"><button class="text-button" data-open-comment type="button">♡ Comment</button><button class="text-button ask-spectators" type="button">Ask spectators</button></div>`;
      article.querySelector("time").textContent = new Date(item.created_at).toLocaleDateString();
      article.querySelector("h2").textContent = item.title;
      article.querySelector("p").textContent = item.body;
      list.prepend(article);
    });
  } catch (error) { showToast(error.message || "Feed could not load"); }
}

async function loadRecommendations() {
  if (!provider.client) return;
  try {
    const items = await provider.select("spectator_recommendations");
    const list = document.querySelector("#recommendation-list");
    list.innerHTML = "";
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "tool-row";
      row.innerHTML = `<strong></strong><small></small>`;
      row.querySelector("strong").textContent = item.body;
      row.querySelector("small").textContent = item.category;
      list.append(row);
    });
  } catch (error) { showToast(error.message || "Recommendations could not load"); }
}

window.LoveMojo = { setOnline, spawnReaction, loadMemories, loadFeed, loadRecommendations };

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
document.querySelectorAll("[data-open-memory]").forEach((button) => button.addEventListener("click", openMemory));
document.querySelector("[data-close-memory]").addEventListener("click", () => document.querySelector("#memory-modal").close());
document.querySelector("#memory-form").addEventListener("submit", saveMemory);
document.querySelector("[data-open-feed-editor]").addEventListener("click", () => document.querySelector("#feed-modal").showModal());
document.querySelector("[data-close-feed]").addEventListener("click", () => document.querySelector("#feed-modal").close());
document.querySelector("#feed-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = { title: document.querySelector("#feed-title").value, body: document.querySelector("#feed-body").value, shared_to_spectators: document.querySelector("#shared-to-spectators").checked, score: 0 };
  try { await provider.insert("feed_items", payload); } catch (error) { showToast(error.message || "Feed could not publish"); return; }
  document.querySelector("#feed-modal").close();
  showToast("Published to your private feed");
  event.target.reset();
});
document.querySelector("#recommendation-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = { category: document.querySelector("#recommendation-category").value.toLowerCase(), body: document.querySelector("#recommendation-body").value, shared_to_spectators: true };
  try { await provider.insert("spectator_recommendations", payload); } catch (error) { showToast(error.message || "Suggestion could not sync"); return; }
  event.target.reset();
  showToast("Suggestion sent to the lounge");
});
document.querySelector("#music-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await provider.insert("molo_content", { kind: "music", body: event.target.querySelector("input").value }); } catch (error) { showToast(error.message || "Music note could not sync"); return; }
  event.target.reset();
  showToast("Music note queued for your partner");
});
document.querySelector("#invite-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = mergeNames(document.querySelector("#profile-name-a").value, document.querySelector("#profile-name-b").value);
  document.querySelector("#invite-output").textContent = `Passcode: ${code} · share inside LoveMojo`;
  state.joined = true;
  state.status = "active";
  localStorage.setItem("lovemojo-state", JSON.stringify(state));
  document.body.classList.remove("prejoin");
  setOnline(false);
  showToast("Your couple passcode is ready");
});
document.querySelectorAll(".interest").forEach((button) => button.addEventListener("click", () => button.classList.toggle("active")));
document.querySelector(".emoji-toggle").addEventListener("click", () => document.querySelector(".reaction-bar").classList.toggle("open"));
document.querySelectorAll("[data-reaction]").forEach((button) => button.addEventListener("click", async () => {
  const emoji = button.dataset.reaction;
  spawnReaction(emoji);
  try { await provider.broadcastEmoji(emoji); } catch (error) { showToast(error.message || "Reaction could not sync"); }
}));
document.querySelector(".notification-button").addEventListener("click", () => showToast("Notifications are controlled by your device settings"));
document.querySelectorAll("[data-toast]").forEach((item) => item.addEventListener("click", () => showToast(item.dataset.toast)));

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
if (!state.joined) document.body.classList.add("prejoin");
setOnline(false);
provider.connect().then(async (connected) => {
  document.querySelector("#sync-state").textContent = connected ? "supabase realtime" : "local preview";
  if (connected) await Promise.all([loadMemories(), loadFeed(), loadRecommendations()]);
}).catch((error) => showToast(error.message || "Supabase connection failed"));
