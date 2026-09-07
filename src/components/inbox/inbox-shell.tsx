"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { ConversationThread } from "./conversation-thread";
import { StatusBadge } from "./status-badge";

type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];

interface InboxShellProps {
  workspaceId: string;
  initialConversations: Conversation[];
  initialContacts: Contact[];
}

function initials(name: string | null, phone: string) {
  const source = name?.trim() || phone;
  return source.slice(0, 2).toUpperCase();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("es", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InboxShell({
  workspaceId,
  initialConversations,
  initialContacts,
}: InboxShellProps) {
  const [conversations, setConversations] = useState(initialConversations);
  const [contacts, setContacts] = useState<Record<string, Contact>>(() =>
    Object.fromEntries(initialContacts.map((c) => [c.id, c])),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`conversations:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as Conversation).id;
            setConversations((prev) => prev.filter((c) => c.id !== oldId));
            return;
          }

          const row = payload.new as Conversation;
          setConversations((prev) => {
            const withoutRow = prev.filter((c) => c.id !== row.id);
            return [row, ...withoutRow].sort(
              (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
            );
          });

          if (payload.eventType === "INSERT" && !contacts[row.contact_id]) {
            supabase
              .from("contacts")
              .select("*")
              .eq("id", row.contact_id)
              .single()
              .then(({ data }) => {
                if (data) setContacts((prev) => ({ ...prev, [data.id]: data }));
              });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const selectedContact = selectedConversation ? contacts[selectedConversation.contact_id] : null;

  return (
    <div className="flex h-dvh min-h-0">
      <aside className="flex w-80 shrink-0 flex-col border-r">
        <div className="border-b p-3">
          <h1 className="text-sm font-semibold">Inbox</h1>
        </div>
        <ScrollArea className="flex-1">
          <ul>
            {conversations.map((conversation) => {
              const contact = contacts[conversation.contact_id];
              const isSelected = conversation.id === selectedId;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(conversation.id)}
                    className={`flex w-full items-center gap-2.5 border-b px-3 py-2.5 text-left hover:bg-muted ${
                      isSelected ? "bg-muted" : ""
                    }`}
                  >
                    <Avatar>
                      <AvatarFallback>
                        {initials(contact?.name ?? null, contact?.phone ?? "??")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {contact?.name || contact?.phone || "Contacto"}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatTime(conversation.updated_at)}
                        </span>
                      </div>
                      <div className="mt-1">
                        <StatusBadge status={conversation.status} />
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
            {conversations.length === 0 && (
              <li className="p-4 text-center text-sm text-muted-foreground">
                Todavía no hay conversaciones.
              </li>
            )}
          </ul>
        </ScrollArea>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {selectedConversation && selectedContact ? (
          <ConversationThread
            key={selectedConversation.id}
            conversation={selectedConversation}
            contact={selectedContact}
            onStatusChange={(status) =>
              setConversations((prev) =>
                prev.map((c) => (c.id === selectedConversation.id ? { ...c, status } : c)),
              )
            }
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Selecciona una conversación
          </div>
        )}
      </section>
    </div>
  );
}
