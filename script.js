const panels = document.querySelectorAll("[data-panel]");
const navItems = document.querySelectorAll("[data-view]");
const toast = document.querySelector(".toast");
let toastTimer;
const coupleState = JSON.parse(localStorage.getItem("lovemojo-couple") || '{"joined":false}');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function switchView(view) {
  panels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== view));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setJoined(joined) {
  coupleState.joined = joined;
  localStorage.setItem("lovemojo-couple", JSON.stringify(coupleState));
  document.body.classList.toggle("prejoin", !joined);
  document.querySelector(".online-signal").classList.toggle("visible", joined);
  if (joined) {
    showToast("Your shared corner is glowing");
    switchView("today");
  }
}

navItems.forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
document.querySelectorAll("[data-view-target]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewTarget)));
document.querySelectorAll("[data-toast]").forEach((item) => item.addEventListener("click", () => showToast(item.dataset.toast)));
document.querySelectorAll(".idea-accept").forEach((item) => item.addEventListener("click", () => showToast(item.dataset.toast)));

document.querySelector("#invite-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const first = document.querySelector("#your-name").value.trim();
  const second = document.querySelector("#partner-name").value.trim();
  if (!first || !second) return;
  const code = [first, second].sort((a, b) => a.localeCompare(b)).map((name) => name.toUpperCase()).join(" + ");
  document.querySelector("#couple-code").textContent = code;
  document.querySelector("#code-card").classList.remove("hidden");
  document.querySelector("#join-code").value = code;
  showToast("Your private invite is ready");
});

document.querySelector("#join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (document.querySelector("#join-code").value.trim().split("+").length !== 2) {
    showToast("Use both names joined with +");
    return;
  }
  setJoined(true);
});

document.querySelector("#copy-code").addEventListener("click", async () => {
  const code = document.querySelector("#couple-code").textContent;
  try { await navigator.clipboard.writeText(code); } catch { /* clipboard may be unavailable in the APK */ }
  showToast("Passcode copied");
});

document.querySelector("#idea-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const type = document.querySelector("#idea-type").value.toUpperCase();
  const input = document.querySelector("#idea-input");
  const item = document.createElement("article");
  item.className = "idea-item";
  item.innerHTML = `<span class="idea-type">${type}</span><strong></strong><small>Suggested by you · waiting for your partner</small>`;
  item.querySelector("strong").textContent = input.value.trim();
  document.querySelector("#idea-list").prepend(item);
  input.value = "";
  showToast("Suggestion shared with your partner");
});

document.querySelector("#studio-form").addEventListener("submit", (event) => {
  event.preventDefault();
  event.currentTarget.reset();
  showToast("Feed and music note sent");
});

document.querySelector(".notification-button").addEventListener("click", (event) => {
  const enabled = event.currentTarget.getAttribute("aria-pressed") !== "true";
  event.currentTarget.setAttribute("aria-pressed", String(enabled));
  document.querySelector(".notification-badge").style.display = enabled ? "none" : "block";
  showToast(enabled ? "Daily love notes are on" : "Notifications paused");
});

async function addMessage(form) {
  const input = form.querySelector("input");
  const value = input.value.trim();
  if (!value) {
    showToast("Write a little something first");
    input.focus();
    return;
  }
  if (form.id === "quick-reply") {
    if (typeof sendLiveMessage === "function" && hasSupabaseConfig()) await sendLiveMessage(value);
    showToast("Reply sent to Alex");
  } else {
    if (typeof sendLiveMessage === "function" && hasSupabaseConfig()) {
      await sendLiveMessage(value);
      input.value = "";
      showToast("Message sent");
      return;
    }
    const bubble = document.createElement("div");
    bubble.className = "bubble bubble-me";
    bubble.innerHTML = `<div><p></p><time>now</time></div>`;
    bubble.querySelector("p").textContent = value;
    document.querySelector(".chat-thread").append(bubble);
    showToast("Message sent");
  }
  input.value = "";
}

document.querySelectorAll("form").forEach((form) => form.addEventListener("submit", (event) => {
  event.preventDefault();
  addMessage(form).catch((error) => showToast(error.message || "Message could not be sent"));
}));

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

connectBackend().then(loadLiveData).catch(() => showToast("Live sync needs a valid Supabase setup"));
document.body.classList.toggle("prejoin", !coupleState.joined);
document.querySelector(".online-signal").classList.toggle("visible", coupleState.joined);
if (!coupleState.joined) switchView("invite");
