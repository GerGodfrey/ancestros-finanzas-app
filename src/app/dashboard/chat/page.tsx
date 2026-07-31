import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/get-user";
import { NavBar } from "@/components/nav-bar";
import { ChatPanel } from "@/components/chat-panel";

export default async function ChatPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar userEmail={user.email} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-bold">Chat</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Pregúntale a tus propios datos.
        </p>
        <div className="mt-6">
          <ChatPanel />
        </div>
      </main>
    </div>
  );
}
