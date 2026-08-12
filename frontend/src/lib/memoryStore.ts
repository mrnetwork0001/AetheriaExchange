// Persistent co-pilot memory, behind a pluggable store interface.
//
// Architecture: localStorage stays the hot store (instant load/save), and a
// write-behind sync pushes AES-GCM-encrypted snapshots to 0G decentralized
// storage via /api/memory whenever the server has a funded 0G wallet
// configured. The client holds only the blob's root-hash pointer; 0G and
// our server only ever see ciphertext.
//
// Threat model, honestly: the encryption key derives from the chat key
// (wallet address) plus a random per-browser salt, so published blobs are
// unreadable without that salt. This protects against the storage layer and
// its observers, not against an attacker with access to this browser.
import type { AppIntent } from "./intent";

export interface ChatMessage {
  role: "user" | "copilot";
  text: string;
  intent?: AppIntent;
}

export interface StoredChat {
  messages: ChatMessage[];
  updatedAt: number;
}

export interface MemoryStore {
  load(key: string): Promise<StoredChat | null>;
  save(key: string, chat: StoredChat): Promise<void>;
  clear(key: string): Promise<void>;
}

const MAX_MESSAGES = 40;
const PREFIX = "aetheria:chat:";

class LocalStorageAdapter implements MemoryStore {
  async load(key: string): Promise<StoredChat | null> {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredChat;
      if (!Array.isArray(parsed?.messages)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async save(key: string, chat: StoredChat): Promise<void> {
    try {
      window.localStorage.setItem(
        PREFIX + key,
        JSON.stringify({
          ...chat,
          messages: chat.messages.slice(-MAX_MESSAGES),
        })
      );
    } catch {
      // Storage full/blocked - memory degrades to session-only.
    }
  }

  async clear(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  }
}

// ── 0G Storage write-behind sync ────────────────────────────────────────

const ROOT_PREFIX = "aetheria:memroot:";
const SALT_KEY = "aetheria:memsalt";
const SYNC_DEBOUNCE_MS = 4000;

function browserSalt(): string {
  let salt = window.localStorage.getItem(SALT_KEY);
  if (!salt) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    salt = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(SALT_KEY, salt);
  }
  return salt;
}

async function deriveKey(chatKey: string): Promise<CryptoKey> {
  const material = new TextEncoder().encode(`${chatKey}:${browserSalt()}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encrypt(chatKey: string, plaintext: string): Promise<string> {
  const key = await deriveKey(chatKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext)
    )
  );
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv);
  packed.set(cipher, iv.length);
  let binary = "";
  packed.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

async function decrypt(chatKey: string, blobB64: string): Promise<string | null> {
  try {
    const packed = Uint8Array.from(atob(blobB64), (c) => c.charCodeAt(0));
    const key = await deriveKey(chatKey);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: packed.slice(0, 12) },
      key,
      packed.slice(12)
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null; // wrong salt/device or corrupted blob
  }
}

class ZeroGSyncedAdapter implements MemoryStore {
  private local = new LocalStorageAdapter();
  private availability: Promise<boolean> | null = null;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  // Per-key generation counter: every save() and clear() bumps it, and an
  // upload only writes its pointer if its captured epoch is still current.
  // Kills two races - a RESET can't be resurrected by an in-flight upload,
  // and a slow older upload can't overwrite a newer snapshot's pointer.
  private epochs = new Map<string, number>();

  private syncAvailable(): Promise<boolean> {
    if (!this.availability) {
      this.availability = fetch("/api/memory?probe=1")
        .then((r) => (r.ok ? r.json() : { available: false }))
        .then((j) => !!j.available)
        .catch(() => false);
    }
    return this.availability;
  }

  async load(key: string): Promise<StoredChat | null> {
    const local = await this.local.load(key);
    if (local) return local;

    // Cold start with a surviving pointer: restore from 0G.
    const root = window.localStorage.getItem(ROOT_PREFIX + key);
    if (!root || !(await this.syncAvailable())) return null;
    try {
      const res = await fetch(`/api/memory?root=${root}`);
      if (!res.ok) return null;
      const { blob } = await res.json();
      const plaintext = blob ? await decrypt(key, blob) : null;
      if (!plaintext) return null;
      const chat = JSON.parse(plaintext) as StoredChat;
      if (!Array.isArray(chat?.messages)) return null;
      await this.local.save(key, chat); // re-hydrate the hot store
      return chat;
    } catch {
      return null;
    }
  }

  async save(key: string, chat: StoredChat): Promise<void> {
    await this.local.save(key, chat); // hot path never waits on the network

    const epoch = (this.epochs.get(key) ?? 0) + 1;
    this.epochs.set(key, epoch);

    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(async () => {
        if (!(await this.syncAvailable())) return;
        try {
          const blob = await encrypt(key, JSON.stringify(chat));
          const res = await fetch("/api/memory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blob }),
          });
          if (!res.ok) return;
          const { rootHash } = await res.json();
          // Superseded by a newer save or a clear while in flight - discard.
          if (this.epochs.get(key) !== epoch) return;
          if (rootHash) {
            window.localStorage.setItem(ROOT_PREFIX + key, rootHash);
          }
        } catch {
          // Sync is best-effort; local memory is intact regardless.
        }
      }, SYNC_DEBOUNCE_MS)
    );
  }

  async clear(key: string): Promise<void> {
    this.epochs.set(key, (this.epochs.get(key) ?? 0) + 1);
    clearTimeout(this.timers.get(key));
    await this.local.clear(key);
    window.localStorage.removeItem(ROOT_PREFIX + key);
  }
}

let store: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore | null {
  if (typeof window === "undefined") return null; // SSR: no memory surface
  if (!store) store = new ZeroGSyncedAdapter();
  return store;
}

// Chats are keyed per wallet so switching accounts switches memory.
export function memoryKey(address: string | undefined): string {
  return address ? address.toLowerCase() : "anon";
}
