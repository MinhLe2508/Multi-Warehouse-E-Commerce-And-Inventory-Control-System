import { useAuthStore } from "@/store/useAuthStore";
import { MAX_CHAT_LENGTH, type ChatReply } from "./chatSession";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");

function parseReply(value: unknown): ChatReply {
  if (!value || typeof value !== "object" || !("reply" in value) || typeof value.reply !== "string" ||
    !value.reply.trim() || value.reply.length > 12000) throw new Error("Phản hồi chatbot không đúng định dạng. Vui lòng thử lại sau.");
  if (!("sessionToken" in value) || typeof value.sessionToken !== "string" || !value.sessionToken.trim() || value.sessionToken.length > 200) {
    throw new Error("Mã hội thoại từ chatbot không hợp lệ.");
  }
  if (!("escalatedToHuman" in value) || typeof value.escalatedToHuman !== "boolean") throw new Error("Trạng thái hỗ trợ từ chatbot không hợp lệ.");
  if (!("isFallback" in value) || typeof value.isFallback !== "boolean") {
    throw new Error("Trạng thái phản hồi dự phòng không hợp lệ.");
  }
  return { answer: value.reply, conversationId: value.sessionToken,
    escalateToSupport: value.escalatedToHuman, isFallback: value.isFallback };
}

// Matches SendChatMessageDto / SendMessageResult in P5 commit 4de4cbc.
// Never retry a POST automatically: a timed-out request may already have been processed.
export async function sendChatMessage(message: string, conversationId: string | undefined, signal: AbortSignal): Promise<ChatReply> {
  const text = message.trim();
  if (!text || text.length > MAX_CHAT_LENGTH) throw new Error(`Câu hỏi cần từ 1 đến ${MAX_CHAT_LENGTH} ký tự.`);
  let session = useAuthStore.getState().session;
  if (session?.tokens.accessToken.startsWith("mock-")) throw new Error("Phiên xem trước không dùng được API chat. Vui lòng đăng nhập bằng tài khoản thật.");
  if (session && session.tokens.accessTokenExpiresAt * 1000 <= Date.now() + 10000) {
    try { session = await useAuthStore.getState().refresh(); }
    catch { throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."); }
  }
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 30000);
  try {
    let response: Response;
    try {
      response = await fetch(`${API}/chatbot`, {
        method: "POST", cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.tokens.accessToken}` } : {}) },
        body: JSON.stringify({ message: text, ...(conversationId ? { sessionToken: conversationId } : {}) }),
      });
    } catch {
      throw new Error("Không nhận được phản hồi. Kiểm tra kết nối hoặc thử lại sau; yêu cầu trước có thể đã đến máy chủ.");
    }
    if (!response.ok) {
      if (response.status === 404 || response.status === 501) throw new Error("Dịch vụ chatbot chưa sẵn sàng. Vui lòng thử lại sau.");
      if (response.status === 401) throw new Error("Vui lòng đăng nhập lại để sử dụng chatbot.");
      if (response.status === 403) throw new Error("Bạn không có quyền sử dụng chức năng chat này.");
      if (response.status === 429) throw new Error("Bạn gửi quá nhanh. Vui lòng chờ một lát rồi thử lại.");
      throw new Error("Không xử lý được câu hỏi. Vui lòng thử lại sau.");
    }
    return parseReply(await response.json().catch(() => null));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
