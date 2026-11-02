const panels = document.querySelectorAll("[data-panel]");
const navItems = document.querySelectorAll("[data-view]");
const toast = document.querySelector(".toast");
let toastTimer;

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

navItems.forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
document.querySelectorAll("[data-view-target]").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewTarget)));
document.querySelectorAll("[data-toast]").forEach((item) => item.addEventListener("click", () => showToast(item.dataset.toast)));

document.querySelector(".notification-button").addEventListener("click", (event) => {
  const enabled = event.currentTarget.getAttribute("aria-pressed") !== "true";
  event.currentTarget.setAttribute("aria-pressed", String(enabled));
  document.querySelector(".notification-badge").style.display = enabled ? "none" : "block";
  showToast(enabled ? "Daily love notes are on" : "Notifications paused");
});

function addMessage(form) {
  const input = form.querySelector("input");
  const value = input.value.trim();
  if (!value) {
    showToast("Write a little something first");
    input.focus();
    return;
  }
  if (form.id === "quick-reply") {
    showToast("Reply sent to Alex");
  } else {
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
  addMessage(form);
}));
