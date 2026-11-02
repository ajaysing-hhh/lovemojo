const provider = window.supabaseRealtimeProvider;
const toast = document.querySelector(".toast");
let toastTimer;
const state = JSON.parse(localStorage.getItem("lovemojo-state") || '{"joined":false,"role":"lover"}');

function unlockApp(role) {
  state.authenticated = true;
  state.role = role;
  localStorage.setItem("lovemojo-state", JSON.stringify(state));
  document.querySelector("#auth-gate").classList.add("hidden");
  if (role === "friend") document.body.classList.add("friend-mode");
}

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
const dashCanvas = document.querySelector("#love-dash");
const dashStart = document.querySelector("#game-start");
if (dashCanvas && dashStart) {
  const context = dashCanvas.getContext("2d");
  let dashFrame;
  let dashRunning = false;
  let dashScore = 0;
  let dashPlayer = { x: 34, y: 112, velocity: 0 };
  let dashObstacle = { x: 510, width: 14 };
  const jump = () => {
    if (!dashRunning) return;
    if (dashPlayer.y >= 112) dashPlayer.velocity = -8.8;
  };
  const drawDash = () => {
    context.clearRect(0, 0, dashCanvas.width, dashCanvas.height);
    context.strokeStyle = "#512530";
    context.beginPath();
    context.moveTo(0, 128);
    context.lineTo(dashCanvas.width, 128);
    context.stroke();
    context.fillStyle = "#ff2400";
    context.beginPath();
    context.arc(dashPlayer.x, dashPlayer.y, 12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#dc143c";
    context.fillRect(dashObstacle.x, 106, dashObstacle.width, 22);
    context.fillStyle = "#e7a5a1";
    context.font = "12px DM Mono";
    context.fillText("jump the little heart", 14, 20);
  };
  const tickDash = () => {
    if (!dashRunning) return;
    dashPlayer.velocity += .45;
    dashPlayer.y = Math.min(112, dashPlayer.y + dashPlayer.velocity);
    dashObstacle.x -= 4.2 + Math.min(3, dashScore / 200);
    if (dashObstacle.x < -dashObstacle.width) {
      dashObstacle.x = dashCanvas.width + Math.random() * 120;
      dashScore += 10;
      document.querySelector("#game-score").textContent = dashScore;
    }
    if (dashObstacle.x < dashPlayer.x + 12 && dashObstacle.x + dashObstacle.width > dashPlayer.x - 12 && dashPlayer.y > 99) {
      dashRunning = false;
      dashStart.textContent = "Again · tap to jump";
      showToast(`Love Dash score: ${dashScore}`);
    }
    drawDash();
    dashFrame = requestAnimationFrame(tickDash);
  };
  const startDash = () => {
    cancelAnimationFrame(dashFrame);
    dashRunning = true;
    dashScore = 0;
    dashPlayer = { x: 34, y: 112, velocity: 0 };
    dashObstacle = { x: 510, width: 14 };
    document.querySelector("#game-score").textContent = "0";
    dashStart.textContent = "Tap the game to jump";
    tickDash();
  };
  dashStart.addEventListener("click", startDash);
  dashCanvas.addEventListener("pointerdown", jump);
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space") { event.preventDefault(); jump(); }
  });
  drawDash();
}
document.querySelector(".emoji-toggle").addEventListener("click", () => document.querySelector(".reaction-bar").classList.toggle("open"));
document.querySelectorAll("[data-reaction]").forEach((button) => button.addEventListener("click", async () => {
  const emoji = button.dataset.reaction;
  spawnReaction(emoji);
  try { await provider.broadcastEmoji(emoji); } catch (error) { showToast(error.message || "Reaction could not sync"); }
}));
document.querySelector(".notification-button").addEventListener("click", () => showToast("Notifications are controlled by your device settings"));
document.querySelectorAll("[data-toast]").forEach((item) => item.addEventListener("click", () => showToast(item.dataset.toast)));
document.querySelector("#auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#auth-name").value.trim();
  const phone = document.querySelector("#auth-phone").value.trim();
  const password = document.querySelector("#auth-password").value;
  const role = document.querySelector("input[name=role]:checked").value;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    showToast("Use an E.164 phone number such as +919876543210");
    return;
  }
  try {
    if (provider.configured()) {
      await provider.connect();
      try { await provider.signInWithPhone(phone, password); }
      catch { await provider.signUpWithPhone(phone, password, name, role); }
    } else {
      document.querySelector("#auth-status").textContent = "Local preview — add Supabase config for phone auth";
    }
    unlockApp(role);
    showToast("Welcome to LoveMojo");
  } catch (error) {
    document.querySelector("#auth-status").textContent = error.message || "Authentication failed";
  }
});
document.querySelector("#reset-password").addEventListener("click", async () => {
  const phone = document.querySelector("#auth-phone").value.trim();
  if (!phone) { showToast("Enter your phone number first"); return; }
  try { await provider.resetPassword(phone); showToast("Recovery instructions sent"); } catch (error) { showToast(error.message || "Recovery is unavailable"); }
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
if (!state.joined) document.body.classList.add("prejoin");
setOnline(false);
if (state.authenticated) unlockApp(state.role);
provider.connect().then(async (connected) => {
  document.querySelector("#sync-state").textContent = connected ? "supabase realtime" : "local preview";
  if (connected) await Promise.all([loadMemories(), loadFeed(), loadRecommendations()]);
}).catch((error) => showToast(error.message || "Supabase connection failed"));
