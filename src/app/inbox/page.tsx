import { createClient } from "@/lib/supabase/server";
import { InboxShell } from "@/components/inbox/inbox-shell";

export default async function InboxPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Inicia sesión para ver el inbox.
      </div>
    );
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Tu usuario todavía no pertenece a ningún workspace.
      </div>
    );
  }

  const { data: conversations } = await supabase
    .from("conversations")
    .select("*")
    .eq("workspace_id", membership.workspace_id)
    .order("updated_at", { ascending: false });

  const contactIds = [...new Set((conversations ?? []).map((c) => c.contact_id))];
  const { data: contacts } = contactIds.length
    ? await supabase.from("contacts").select("*").in("id", contactIds)
    : { data: [] };

  return (
    <InboxShell
      workspaceId={membership.workspace_id}
      initialConversations={conversations ?? []}
      initialContacts={contacts ?? []}
    />
  );
}
