"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { MessageCircle, Send, X, RotateCcw, LoaderCircle, Headphones, Plus, ArrowUpRight, Bot } from "lucide-react";
import { useChatbot } from "@/hooks/useChatbot";
import { MAX_CHAT_LENGTH } from "@/shared/lib/chatSession";
import FormattedChatMessage from "./FormattedChatMessage";

const starterQuestions = [
  "Đặt hàng như thế nào?",
  "Có những cách thanh toán nào?",
  "Shop có tai nghe nào?",
  "Đơn hàng của tôi tới đâu rồi?",
];

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
    const show = () => setOpen(true);
    window.addEventListener("multimart:open-support", show);
    return () => window.removeEventListener("multimart:open-support", show);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (open && (chat.messages.length || chat.sending)) end.current?.scrollIntoView({ block: "nearest" });
  }, [open, chat.messages.length, chat.sending]);

  function close() { setOpen(false); launcher.current?.focus(); }

  return (
    <aside className="fixed bottom-3 right-3 z-50 sm:bottom-5 sm:right-6" aria-label="Hỗ trợ mua sắm">
      {open && (
        <section key={identity} id="storefront-chat" role="dialog" aria-modal="false" aria-labelledby="chat-title"
          onKeyDown={event => { if (event.key === "Escape") close(); }}
          className="mb-3 flex h-[min(36rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-1.5rem))] sm:h-[min(36rem,calc(100dvh-7rem))] sm:w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-2xl">
          <header className="flex items-center gap-3 bg-brand-700 p-4 text-white">
            <MessageCircle size={24} aria-hidden="true" />
            <div className="flex-1"><h2 id="chat-title" className="font-semibold">Trợ lý MultiMart</h2><p className="text-xs text-brand-100">Hỗ trợ sản phẩm, thanh toán và đơn hàng</p></div>
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
            {chat.messages.length === 0 && <div className="space-y-3 pb-4 text-sm text-slate-700">
              <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Bot size={20} aria-hidden="true" /></span>
                <div><p className="mb-1 font-semibold text-slate-950">Chào bạn! Mình là trợ lý MultiMart.</p>
                  <p className="mb-0 leading-relaxed">Chọn một câu bên dưới hoặc gõ câu hỏi của bạn.</p></div>
              </div>
              <div className="grid gap-1.5" aria-label="Câu hỏi gợi ý">
                {starterQuestions.map(question => <button key={question} type="button" disabled={!chat.ready || chat.sending}
                  onClick={() => void chat.send(question)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50">
                  {question}<ArrowUpRight size={15} className="shrink-0 text-blue-700" aria-hidden="true" />
                </button>)}
              </div>
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
                {message.escalateToSupport && (
                  <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950 shadow-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-amber-900">
                      <Headphones size={15} className="text-amber-700" />
                      Đã gửi yêu cầu hỗ trợ
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-900">
                      {message.escalationMessage || "Nhân viên có thể xem phiên chat này để hỗ trợ bạn."}
                    </p>
                    <p className="mt-1.5 text-[11px] text-amber-700/80">
                      Bạn có thể tiếp tục hỏi trợ lý trong lúc chờ.
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
