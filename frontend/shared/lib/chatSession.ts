export const MAX_CHAT_LENGTH = 1000;
export const MAX_CHAT_HISTORY = 50;

export interface ChatReply {
  answer: string;
  conversationId?: string;
  escalateToSupport?: boolean;
  escalationMessage?: string;
  isFallback?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  delivery: "pending" | "sent" | "failed";
  escalateToSupport?: boolean;
  escalationMessage?: string;
  isFallback?: boolean;
}

export interface ChatSnapshot {
  scope: string | null;
  messages: ChatMessage[];
  conversationId?: string;
  sending: boolean;
  error: string | null;
  storageWarning: string | null;
}

type Request = (message: string, conversationId: string | undefined, signal: AbortSignal) => Promise<ChatReply>;
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const empty: ChatSnapshot = { scope: null, messages: [], sending: false, error: null, storageWarning: null };
const key = (scope: string) => `mwh-chat-v1:${encodeURIComponent(scope)}`;

// Whitelist persisted fields; never load tokens or arbitrary server objects into the UI.
function restore(raw: string | null): Pick<ChatSnapshot, "messages" | "conversationId"> {
  if (!raw) return { messages: [] };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("messages" in value) || !Array.isArray(value.messages)) {
    throw new Error("Invalid chat history");
  }
  const messages: ChatMessage[] = [];
  for (const row of value.messages.slice(-MAX_CHAT_HISTORY)) {
    if (!row || typeof row !== "object" || typeof row.id !== "string" ||
      (row.role !== "user" && row.role !== "assistant") || typeof row.text !== "string" ||
      !row.text.trim() || row.text.length > (row.role === "user" ? MAX_CHAT_LENGTH : 12000) ||
      !["sent", "pending", "failed"].includes(row.delivery)) throw new Error("Invalid message");
    messages.push({ id: row.id, role: row.role, text: row.text, isFallback: row.isFallback === true,
      delivery: row.delivery === "pending" ? "failed" : row.delivery,
      ...(row.role === "assistant" && row.escalateToSupport === true ? { escalateToSupport: true,
        ...(typeof row.escalationMessage === "string" ? { escalationMessage: row.escalationMessage.slice(0, 2000) } : {}) } : {}),
    });
  }
  const conversationId = "conversationId" in value && typeof value.conversationId === "string" &&
    value.conversationId.length <= 200 && value.conversationId.trim() ? value.conversationId : undefined;
  return { messages, conversationId };
}

/** One request at a time; abort and ignore stale replies on clear, logout or navigation. */
export function createChatSession(request: Request, storage: () => Storage) {
  let state = empty;
  let version = 0;
  let sequence = 0;
  let pending: AbortController | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: ChatSnapshot) => {
    state = next;
    listeners.forEach(listener => listener());
  };
  const cancel = () => { version++; pending?.abort(); pending = null; };
  const persist = () => {
    if (!state.scope) return;
    try {
      storage().setItem(key(state.scope), JSON.stringify({ messages: state.messages, conversationId: state.conversationId }));
    } catch {
      publish({ ...state, storageWarning: "Không lưu được lịch sử trên trình duyệt. Bạn vẫn có thể tiếp tục chat." });
    }
  };

  async function send(text: string, retry = false): Promise<boolean> {
    const message = text.trim();
    if (!state.scope || state.sending) return false;
    if (!message || message.length > MAX_CHAT_LENGTH) {
      publish({ ...state, error: `Nhập câu hỏi từ 1 đến ${MAX_CHAT_LENGTH} ký tự.` });
      return false;
    }
    const id = `${Date.now()}-${++sequence}`;
    const previous = retry ? state.messages.slice(0, -1) : state.messages;
    const user: ChatMessage = { id, role: "user", text: message, delivery: "pending" };
    const controller = new AbortController();
    pending = controller;
    const current = ++version;
    publish({ ...state, messages: [...previous, user].slice(-MAX_CHAT_HISTORY), sending: true, error: null });
    persist();
    try {
      const reply = await request(message, state.conversationId, controller.signal);
      if (current !== version) return false;
      publish({ ...state, sending: false, error: null,
        conversationId: reply.conversationId ?? state.conversationId,
        messages: [...state.messages.map(row => row.id === id ? { ...row, delivery: "sent" as const } : row),
          { id: `${id}-reply`, role: "assistant" as const, text: reply.answer, delivery: "sent" as const,
            escalateToSupport: reply.escalateToSupport, escalationMessage: reply.escalationMessage,
            isFallback: reply.isFallback }].slice(-MAX_CHAT_HISTORY),
      });
      persist();
      return true;
    } catch (cause) {
      if (current !== version) return false;
      publish({ ...state, sending: false,
        error: cause instanceof Error ? cause.message : "Không gửi được tin nhắn. Vui lòng thử lại.",
        messages: state.messages.map(row => row.id === id ? { ...row, delivery: "failed" } : row),
      });
      persist();
      return false;
    } finally {
      if (current === version) pending = null;
    }
  }

  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    getServerSnapshot: () => empty,
    activate(scope: string) {
      cancel();
      let history: ReturnType<typeof restore> = { messages: [] };
      let storageWarning: string | null = null;
      try { history = restore(storage().getItem(key(scope))); }
      catch { storageWarning = "Không đọc được lịch sử cũ. Đã mở cuộc trò chuyện mới."; }
      const last = history.messages.at(-1);
      publish({ ...empty, ...history, scope, storageWarning,
        error: last?.delivery === "failed" ? "Tin nhắn trước chưa nhận được phản hồi. Bạn có thể thử gửi lại." : null });
    },
    deactivate() { cancel(); publish(empty); },
    clear() { cancel(); publish({ ...empty, scope: state.scope }); persist(); },
    send,
    retry() {
      const last = state.messages.at(-1);
      return last?.role === "user" && last.delivery === "failed" ? send(last.text, true) : Promise.resolve(false);
    },
  };
}
