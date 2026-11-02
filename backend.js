const supabaseScript = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

class SupabaseRealtimeProvider {
  constructor() {
    this.client = null;
    this.channel = null;
    this.coupleId = window.LOVEMOJO_CONFIG?.coupleId || null;
    this.userId = null;
  }

  configured() {
    const config = window.LOVEMOJO_CONFIG;
    return Boolean(config?.supabaseUrl?.startsWith("https://") && config.supabaseAnonKey && !config.supabaseUrl.includes("YOUR_") && !config.supabaseAnonKey.includes("YOUR_"));
  }

  async connect() {
    if (!this.configured()) return false;
    if (!window.supabase) await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = supabaseScript;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load Supabase client"));
      document.head.append(script);
    });
    const config = window.LOVEMOJO_CONFIG;
    this.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data: { user } } = await this.client.auth.getUser();
    this.userId = user?.id || null;
    if (this.coupleId) this.startRoom();
    return true;
  }

  startRoom() {
    this.channel = this.client.channel(`couple_room:${this.coupleId}`, { config: { presence: { key: this.userId || crypto.randomUUID() } } });
    this.channel
      .on("presence", { event: "sync" }, () => {
        const state = this.channel.presenceState();
        const online = Object.keys(state).length >= 2;
        window.LoveMojo.setOnline(online);
      })
      .on("broadcast", { event: "emoji" }, ({ payload }) => window.LoveMojo.spawnReaction(payload.emoji))
      .on("postgres_changes", { event: "*", schema: "public", table: "memories", filter: `couple_id=eq.${this.coupleId}` }, () => window.LoveMojo.loadMemories())
      .on("postgres_changes", { event: "*", schema: "public", table: "feed_items", filter: `couple_id=eq.${this.coupleId}` }, () => window.LoveMojo.loadFeed())
      .on("postgres_changes", { event: "*", schema: "public", table: "spectator_recommendations", filter: `couple_id=eq.${this.coupleId}` }, () => window.LoveMojo.loadRecommendations())
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await this.channel.track({ user_id: this.userId, role: "lover", online_at: new Date().toISOString() });
      });
  }

  async broadcastEmoji(emoji) {
    if (this.channel) await this.channel.send({ type: "broadcast", event: "emoji", payload: { emoji } });
  }

  async insert(table, payload) {
    if (!this.client) return false;
    const { data: { user } } = await this.client.auth.getUser();
    const { error } = await this.client.from(table).insert({ ...payload, author_id: user?.id || payload.author_id });
    if (error) throw error;
    return true;
  }

  async select(table, query = {}) {
    if (!this.client || !this.coupleId) return [];
    let request = this.client.from(table).select("*").eq("couple_id", this.coupleId);
    Object.entries(query).forEach(([key, value]) => { request = request.eq(key, value); });
    const { data, error } = await request.order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data || [];
  }
}

window.supabaseRealtimeProvider = new SupabaseRealtimeProvider();
