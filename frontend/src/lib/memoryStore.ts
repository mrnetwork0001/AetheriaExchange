// Persistent co-pilot memory, behind a pluggable store interface.
//
// Today: a wallet-keyed localStorage adapter (local-first, zero setup, no
// data leaves the browser). The interface is the seam where a 0G Storage
// adapter plugs in next: same load/save/clear contract, blobs encrypted
// client-side with a wallet-derived key before upload, so trading intent is
// never published in plaintext to decentralized storage.
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

let store: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore | null {
  if (typeof window === "undefined") return null; // SSR: no memory surface
  if (!store) store = new LocalStorageAdapter();
  return store;
}

// Chats are keyed per wallet so switching accounts switches memory.
export function memoryKey(address: string | undefined): string {
  return address ? address.toLowerCase() : "anon";
}
