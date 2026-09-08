import { ChatPanel } from "@/components/chat-panel";

export default function ChatPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-section">
      <h1 className="font-display text-2xl font-light tracking-tight">Chat</h1>
      <p className="mt-tight max-w-[62ch] text-sm leading-relaxed text-text-muted">
        Pregúntale a tus propios datos.
      </p>
      <div className="mt-block">
        <ChatPanel />
      </div>
    </main>
  );
}
