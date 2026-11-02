const supabaseScript = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
const DB_NAME = "lovemojo_v5_db";
const DB_VERSION = 1;
const MAX_RETRIES = 5;

function uuid() {
  return crypto.randomUUID();
}

function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      ["feed_items", "memories", "pending_media", "sync_queue", "kv_cache"].forEach((name) => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function localPut(storeName, value) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put({ id: value.id || uuid(), ...value });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function localAll(storeName) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

class SupabaseRealtimeProvider {
  constructor() {
    this.client = null;
    this.channel = null;
    this.coupleId = window.LOVEMOJO_CONFIG?.coupleId || null;
    this.userId = null;
    this.presenceGraceMs = 45_000;
    this.lastVisibleAt = Date.now();
    this.retryTimer = null;
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
    const { data: { user }, error } = await this.client.auth.getUser();
    if (error) throw error;
    this.userId = user?.id || null;
    this.coupleId = config.coupleId || await this.findCoupleId();
    if (this.coupleId) this.startRoom();
    window.addEventListener("online", () => this.flushQueue());
    window.addEventListener("visibilitychange", () => this.updatePresence());
    window.addEventListener("pagehide", () => this.untrackPresence());
    await this.flushQueue();
    return true;
  }

  async signInWithPhone(phone, password) {
    if (!this.client) throw new Error("Supabase is not connected");
    const { data, error } = await this.client.auth.signInWithPassword({ phone, password });
    if (error) throw error;
    return data;
  }

  async signUpWithPhone(phone, password, displayName, role) {
    if (!this.client) throw new Error("Supabase is not connected");
    const { data, error } = await this.client.auth.signUp({ phone, password, options: { data: { display_name: displayName, role } } });
    if (error) throw error;
    if (data.user) await this.client.from("profiles").upsert({ id: data.user.id, display_name: displayName, phone, role });
    return data;
  }

  async resetPassword(phone) {
    if (!this.client) throw new Error("Supabase is not connected");
    const { error } = await this.client.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
    if (error) throw error;
  }

  async findCoupleId() {
    if (!this.userId) return null;
    const { data, error } = await this.client.from("couples").select("id").or(`partner_1_id.eq.${this.userId},partner_2_id.eq.${this.userId}`).maybeSingle();
    if (error) throw error;
    return data?.id || null;
  }

  startRoom() {
    this.channel = this.client.channel(`couple_room:${this.coupleId}`, { config: { presence: { key: this.userId || uuid() } } });
    this.channel
      .on("presence", { event: "sync" }, () => {
        const state = this.channel.presenceState();
        window.LoveMojo?.setOnline(Object.keys(state).length >= 2);
      })
      .on("broadcast", { event: "emoji" }, ({ payload }) => window.LoveMojo?.spawnReaction(payload.emoji))
      .on("broadcast", { event: "punch" }, ({ payload }) => window.LoveMojo?.receivePunch(payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "memories", filter: `couple_id=eq.${this.coupleId}` }, () => window.LoveMojo?.loadMemories())
      .on("postgres_changes", { event: "*", schema: "public", table: "feed_items", filter: `couple_id=eq.${this.coupleId}` }, () => window.LoveMojo?.loadFeed())
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await this.updatePresence();
      });
  }

  async updatePresence() {
    if (!this.channel || document.visibilityState === "hidden") return;
    await this.channel.track({ user_id: this.userId, online_at: new Date().toISOString() });
    this.lastVisibleAt = Date.now();
  }

  async untrackPresence() {
    if (this.channel && Date.now() - this.lastVisibleAt > this.presenceGraceMs) await this.channel.untrack();
  }

  async broadcast(event, payload) {
    if (this.channel) await this.channel.send({ type: "broadcast", event, payload });
  }

  async insert(table, payload) {
    const operationId = uuid();
    const queueItem = { id: operationId, operation_id: operationId, entity_type: table, entity_id: payload.id || operationId, action: "UPSERT", base_revision: payload.revision || 1, payload, retry_count: 0, next_retry_at: Date.now() };
    if (!this.client || !navigator.onLine) {
      await localPut("sync_queue", queueItem);
      return false;
    }
    const { data: { user } } = await this.client.auth.getUser();
    const { error } = await this.client.from(table).insert({ ...payload, author_id: user?.id || payload.author_id, couple_id: payload.couple_id || this.coupleId, last_operation_id: operationId });
    if (error) {
      await localPut("sync_queue", queueItem);
      throw error;
    }
    return true;
  }

  async flushQueue() {
    if (!this.client || !navigator.onLine) return;
    const queue = await localAll("sync_queue");
    for (const item of queue.filter((entry) => entry.next_retry_at <= Date.now())) {
      try {
        const { error } = await this.client.from(item.entity_type).upsert({ ...item.payload, id: item.entity_id, last_operation_id: item.operation_id }, { onConflict: "id" });
        if (error) throw error;
        const db = await openStore();
        db.transaction("sync_queue", "readwrite").objectStore("sync_queue").delete(item.id);
      } catch {
        const retryCount = item.retry_count + 1;
        if (retryCount >= MAX_RETRIES) continue;
        await localPut("sync_queue", { ...item, retry_count: retryCount, next_retry_at: Date.now() + (2 ** retryCount) * 1000 });
      }
    }
  }

  async select(table, query = {}) {
    if (!this.client || !this.coupleId) return localAll(table);
    let request = this.client.from(table).select("*").eq("couple_id", this.coupleId);
    Object.entries(query).forEach(([key, value]) => { request = request.eq(key, value); });
    const { data, error } = await request.order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    for (const row of data || []) await localPut(table, row);
    return data || [];
  }

  async compressImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", .82));
  }

  async uploadPrivateMedia(file, entityId) {
    if (!this.client || !this.coupleId) throw new Error("Connect a couple space before uploading media");
    const blob = await this.compressImage(file);
    const path = `${this.coupleId}/${entityId}.webp`;
    await localPut("pending_media", { id: path, path, blob });
    const { error } = await this.client.storage.from("couple-media").upload(path, blob, { contentType: "image/webp", upsert: true });
    if (error) throw error;
    const pending = await openStore();
    pending.transaction("pending_media", "readwrite").objectStore("pending_media").delete(path);
    return path;
  }

  async signedMediaUrl(path) {
    if (!this.client) return null;
    const { data, error } = await this.client.storage.from("couple-media").createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  }
}

window.supabaseRealtimeProvider = new SupabaseRealtimeProvider();
