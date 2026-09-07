"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setAiActive, sendHumanMessage } from "@/app/inbox/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import type { ConversationStatus, Database } from "@/lib/supabase/types";
import { StatusBadge } from "./status-badge";

type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Message = Database["public"]["Tables"]["messages"]["Row"];

interface ConversationThreadProps {
  conversation: Conversation;
  contact: Contact;
  onStatusChange: (status: ConversationStatus) => void;
}

function isWindowOpen(conversation: Conversation) {
  if (!conversation.window_expires_at) return false;
  return new Date(conversation.window_expires_at).getTime() > Date.now();
}

export function ConversationThread({
  conversation,
  contact,
  onStatusChange,
}: ConversationThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, startSending] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (isMounted && data) setMessages(data);
      });

    const channel = supabase
      .channel(`messages:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const windowOpen = isWindowOpen(conversation);

  function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    startSending(async () => {
      await sendHumanMessage(conversation.id, body);
    });
  }

  function handleToggleAi(checked: boolean) {
    onStatusChange(checked ? "ai_active" : "human_active");
    startSending(async () => {
      await setAiActive(conversation.id, checked);
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b p-3">
        <div>
          <div className="text-sm font-medium">{contact.name || contact.phone}</div>
          <div className="text-xs text-muted-foreground">{contact.phone}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${windowOpen ? "text-foreground" : "text-destructive"}`}>
            {windowOpen ? "Ventana 24h abierta" : "Ventana 24h cerrada"}
          </span>
          <StatusBadge status={conversation.status} />
          <label className="flex items-center gap-2 text-xs">
            IA
            <Switch
              checked={conversation.status === "ai_active"}
              onCheckedChange={handleToggleAi}
            />
          </label>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-2">
          {messages.map((message) => {
            const isOutbound = message.direction === "outbound";
            return (
              <div
                key={message.id}
                className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                    isOutbound ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {message.body}
                  <div
                    className={`mt-1 text-[10px] opacity-70 ${
                      isOutbound ? "text-right" : "text-left"
                    }`}
                  >
                    {message.sender === "ai" ? "IA" : message.sender === "human" ? "Humano" : ""}
                    {" · "}
                    {new Date(message.created_at).toLocaleTimeString("es", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            windowOpen
              ? "Escribe un mensaje…"
              : "Ventana cerrada: solo templates aprobados (pendiente de implementar)"
          }
          className="min-h-[44px] flex-1 resize-none"
        />
        <Button onClick={handleSend} disabled={isSending || !draft.trim()}>
          Enviar
        </Button>
      </div>
    </div>
  );
}
