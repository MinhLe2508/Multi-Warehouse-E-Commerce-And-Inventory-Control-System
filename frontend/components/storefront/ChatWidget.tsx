"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { MessageCircle, Send, X, RotateCcw, LoaderCircle, Headphones, Plus } from "lucide-react";
import { useChatbot } from "@/hooks/useChatbot";
import { MAX_CHAT_LENGTH } from "@/shared/lib/chatSession";
import FormattedChatMessage from "./FormattedChatMessage";

function ChatComposer({ ready, sending, onSend, inputRef }: {
  ready: boolean; sending: boolean; onSend: (text: string) => Promise<boolean>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [draft, setDraft] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || sending || !draft.trim()) return;
    const text = draft;
    setDraft("");
    void onSend(text);
  }
  return <form onSubmit={submit} className="border-t border-slate-100 bg-white p-3">
    <label htmlFor="chat-message" className="sr-only">Câu hỏi cho trợ lý</label>
    <div className="flex items-end gap-2">
      <textarea ref={inputRef} id="chat-message" name="message" value={draft} rows={2} maxLength={MAX_CHAT_LENGTH} required
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
        placeholder="Nhập câu hỏi…" disabled={!ready}
        className="min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm disabled:opacity-60" />
      <button type="submit" disabled={!ready || sending || !draft.trim()} aria-label="Gửi câu hỏi"
        className="rounded-xl bg-brand-600 p-3 text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"><Send size={18} /></button>
    </div>
    <p className="mt-1 text-right text-[11px] text-slate-500">Tối đa {MAX_CHAT_LENGTH} ký tự · Shift + Enter để xuống dòng</p>
  </form>;
}

export default function ChatWidget() {
  const chat = useChatbot();
  const [open, setOpen] = useState(false);
  const [composerVersion, setComposerVersion] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);
  // Account changes also remount the panel so drafts cannot cross accounts.
  const identity = chat.scope ?? "loading";

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: "nearest" });
  }, [open, chat.messages.length, chat.sending]);

  function close() { setOpen(false); launcher.current?.focus(); }

  return (
    <aside className="fixed bottom-5 right-4 z-50 sm:right-6" aria-label="Hỗ trợ mua sắm">
      {open && (
        <section key={identity} id="storefront-chat" role="dialog" aria-modal="false" aria-labelledby="chat-title"
          onKeyDown={event => { if (event.key === "Escape") close(); }}
          className="mb-3 flex h-[min(36rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-2xl">
          <header className="flex items-center gap-3 bg-brand-700 p-4 text-white">
            <MessageCircle size={24} aria-hidden="true" />
            <div className="flex-1"><h2 id="chat-title" className="font-semibold">Trợ lý MultiMart</h2><p className="text-xs text-brand-100">Hỏi về sản phẩm và chính sách mua hàng</p></div>
            <button type="button" onClick={close} aria-label="Đóng chat" className="rounded-lg p-2 hover:bg-white/15"><X size={20} /></button>
          </header>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2">
            <button
              type="button"
              disabled={!chat.ready || chat.sending}
              onClick={() => void chat.send("Tôi muốn gặp nhân viên CSKH hỗ trợ")}
              title="Chuyển phiên chat sang chuyên viên tư vấn hỗ trợ"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Headphones size={13} className="text-amber-700" />
              Gặp nhân viên
            </button>
            <button
              type="button"
              disabled={!chat.ready}
              onClick={() => { chat.clear(); setComposerVersion(value => value + 1); }}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md p-1 text-xs font-medium text-slate-600 hover:text-brand-700 disabled:opacity-50"
            >
              <Plus size={14} />Chat mới
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
            {chat.messages.length === 0 && <div className="space-y-3 py-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">MultiMart có thể hỗ trợ gì cho bạn?</p>
              <p>Hỏi về đổi trả, giao hàng hoặc sản phẩm. Đăng nhập để tra cứu thông tin đơn hàng khi dịch vụ hỗ trợ.</p>
              <p className="text-xs">Không gửi mật khẩu, mã OTP hay thông tin thẻ ngân hàng.</p>
            </div>}
            <div role="log" aria-label="Lịch sử hội thoại" aria-live="polite" aria-relevant="additions" className="space-y-3">
              {chat.messages.map(message => <div key={message.id} className={message.role === "user" ? "ml-6" : "mr-6"}>
                <p className="mb-1 text-xs font-medium text-slate-500">{message.role === "user" ? "Bạn" : "Trợ lý MultiMart"}</p>
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm transition-all ${
                    message.role === "user"
                      ? "rounded-tr-xs bg-brand-600 text-white shadow-xs"
                      : "rounded-tl-xs border border-slate-200/90 bg-white shadow-xs"
                  }`}
                >
                  <FormattedChatMessage content={message.text} isUser={message.role === "user"} />
                </div>
                {message.delivery === "failed" && <p className="mt-1 text-xs text-red-700">Chưa nhận được phản hồi</p>}
                {message.role === "assistant" && message.isFallback && !message.escalateToSupport && (
                  <p className="mt-1.5 text-[11.5px] font-medium text-amber-700">
                    Phản hồi dự phòng — cần nhân viên xác nhận thêm.
                  </p>
                )}
                {message.escalateToSupport && (
                  <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950 shadow-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-amber-900">
                      <Headphones size={15} className="text-amber-700" />
                      Đã ghi nhận nhu cầu CSKH
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-900">
                      {message.escalationMessage || "Phiên chat đã được đánh dấu cần nhân viên hỗ trợ."}
                    </p>
                    <p className="mt-1.5 text-[11px] text-amber-700/80">
                      Chưa xác nhận có nhân viên trực tuyến hoặc tiếp nhận xử lý.
                    </p>
                  </div>
                )}
              </div>)}
            </div>
            {chat.sending && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" />Đang chờ phản hồi…</p>}
            <div ref={end} />
          </div>
          {chat.storageWarning && <p role="status" className="px-4 pt-2 text-xs text-amber-800">{chat.storageWarning}</p>}
          {chat.error && <div role="alert" className="border-t border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>{chat.error}</p>
            {chat.messages.at(-1)?.delivery === "failed" && <button type="button" disabled={chat.sending} onClick={() => { void chat.retry(); }} className="mt-2 inline-flex items-center gap-1 rounded-md font-semibold underline"><RotateCcw size={14} />Thử gửi lại</button>}
          </div>}
          <ChatComposer key={`${identity}:${composerVersion}`} ready={chat.ready} sending={chat.sending} onSend={chat.send} inputRef={input} />
        </section>
      )}
      <button ref={launcher} type="button" onClick={() => open ? close() : setOpen(true)} aria-expanded={open} aria-controls="storefront-chat"
        aria-label={open ? "Đóng trợ lý MultiMart" : "Mở trợ lý MultiMart"}
        className="ml-auto flex items-center gap-2 rounded-full bg-brand-700 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-800">
        {open ? <X size={20} /> : <MessageCircle size={20} />}Hỗ trợ
      </button>
    </aside>
  );
}
