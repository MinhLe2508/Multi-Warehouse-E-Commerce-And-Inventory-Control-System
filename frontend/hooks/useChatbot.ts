"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createChatSession } from "@/shared/lib/chatSession";
import { sendChatMessage } from "@/shared/lib/chatbotApi";
import { useAuthStore } from "@/store/useAuthStore";

export function useChatbot() {
  const ready = useAuthStore(state => state.ready);
  const userId = useAuthStore(state => state.session?.user.id);
  const scope = userId ? `user:${userId}` : "guest";
  const [chat] = useState(() => createChatSession(sendChatMessage, () => window.sessionStorage));
  const snapshot = useSyncExternalStore(chat.subscribe, chat.getSnapshot, chat.getServerSnapshot);

  useEffect(() => {
    if (!ready) return;
    chat.activate(scope);
    return () => chat.deactivate();
  }, [chat, scope, ready]);

  // Hide the previous user's history immediately, before the activation effect runs.
  const active = ready && snapshot.scope === scope;
  return { ...snapshot, scope: ready ? scope : null, messages: active ? snapshot.messages : [],
    error: active ? snapshot.error : null, storageWarning: active ? snapshot.storageWarning : null,
    sending: active && snapshot.sending, ready: active,
    send: chat.send, retry: chat.retry, clear: chat.clear,
  };
}
