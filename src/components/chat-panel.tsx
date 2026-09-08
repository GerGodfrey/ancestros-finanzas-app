"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

type Message = { id?: string; role: "user" | "assistant"; content: string };

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadHistory() {
    const res = await fetch("/api/chat");
    const data = await res.json();
    setMessages(data.messages ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial al montar, patrón intencional
    loadHistory();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-lg border border-border bg-surface-raised">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-text-faint">
            Pregúntame algo sobre tus movimientos, tarjetas o gasto del mes —
            ej. &ldquo;¿cuánto gasté en restaurantes en julio?&rdquo; o
            &ldquo;¿qué planes MSI tengo activos?&rdquo;
          </p>
        )}
        {messages.map((m, idx) => (
          <div
            key={m.id ?? idx}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-accent text-text"
                : "bg-surface-raised-2 text-text"
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="max-w-[85%] rounded-lg bg-surface-raised-2 px-3 py-2 text-sm text-text-muted">
            Pensando…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="border-t border-border px-4 py-2 text-xs text-negative">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta…"
          className="flex-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text"
        />
        <Button size="md"
          type="submit"
          disabled={sending || !input.trim()}
          
        >
          Enviar
        </Button>
      </form>
    </div>
  );
}
