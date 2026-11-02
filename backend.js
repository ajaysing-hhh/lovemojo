const supabaseScript = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
let supabaseClient;

function hasSupabaseConfig() {
  const config = window.LOVEMOJO_CONFIG;
  return config?.supabaseUrl?.startsWith("https://") &&
    config?.supabaseAnonKey &&
    !config.supabaseUrl.includes("YOUR_PROJECT") &&
    !config.supabaseAnonKey.includes("YOUR_");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load Supabase client"));
    document.head.append(script);
  });
}

async function connectBackend() {
  if (!hasSupabaseConfig()) return null;
  if (!window.supabase) await loadScript(supabaseScript);
  const config = window.LOVEMOJO_CONFIG;
  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  return supabaseClient;
}

async function loadLiveData() {
  if (!supabaseClient || !window.LOVEMOJO_CONFIG.coupleId) return;
  const coupleId = window.LOVEMOJO_CONFIG.coupleId;
  const [{ data: messages, error: messageError }, { data: posts, error: postError }] = await Promise.all([
    supabaseClient.from("messages").select("*").eq("couple_id", coupleId).order("created_at", { ascending: true }).limit(50),
    supabaseClient.from("daily_posts").select("*").eq("couple_id", coupleId).order("published_for", { ascending: false }).limit(1),
  ]);
  if (messageError || postError) throw messageError || postError;
  if (messages?.length) renderLiveMessages(messages);
  if (posts?.[0]) renderLivePost(posts[0]);
  supabaseClient.channel("lovemojo-live")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `couple_id=eq.${coupleId}` }, ({ new: message }) => renderLiveMessages([message], true))
    .subscribe();
}

function renderLiveMessages(messages, append = false) {
  const thread = document.querySelector(".chat-thread");
  if (!thread) return;
  if (!append) thread.querySelectorAll(".bubble").forEach((bubble) => bubble.remove());
  messages.forEach((message) => {
    const bubble = document.createElement("div");
    const mine = supabaseClient.auth.getUser && message.sender_id === window.LOVEMOJO_CONFIG.userId;
    bubble.className = `bubble ${mine ? "bubble-me" : "bubble-them"}`;
    bubble.innerHTML = `${mine ? "" : '<span class="avatar avatar-alex">A</span>'}<div><p></p><time>${new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>`;
    bubble.querySelector("p").textContent = message.body;
    thread.append(bubble);
  });
}

function renderLivePost(post) {
  const title = document.querySelector(".daily-card h2");
  const copy = document.querySelector(".daily-copy");
  if (title) title.textContent = post.title;
  if (copy) copy.textContent = post.body;
}

async function sendLiveMessage(body) {
  if (!supabaseClient || !window.LOVEMOJO_CONFIG.coupleId) return false;
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) throw authError || new Error("Sign in before sending a message");
  const { error } = await supabaseClient.from("messages").insert({
    couple_id: window.LOVEMOJO_CONFIG.coupleId,
    sender_id: user.id,
    body,
  });
  if (error) throw error;
  return true;
}
