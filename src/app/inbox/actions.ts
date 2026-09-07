"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone, sendText } from "@/lib/ycloud/client";

// RLS on `conversations`/`messages` scopes every read and write below to
// workspaces the signed-in user actually belongs to — no extra membership
// check needed here.

export async function setAiActive(conversationId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ status: active ? "ai_active" : "human_active" })
    .eq("id", conversationId);

  if (error) throw new Error(error.message);
  revalidatePath("/inbox");
}

export async function sendHumanMessage(conversationId: string, body: string) {
  if (!body.trim()) return;

  const supabase = await createClient();

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (conversationError || !conversation) {
    throw new Error(conversationError?.message ?? "Conversation not found");
  }

  const [{ data: workspace }, { data: contact }] = await Promise.all([
    supabase.from("workspaces").select("*").eq("id", conversation.workspace_id).single(),
    supabase.from("contacts").select("*").eq("id", conversation.contact_id).single(),
  ]);

  if (!workspace || !contact) {
    throw new Error("Workspace or contact not found");
  }

  if (!workspace.ycloud_api_key || !workspace.ycloud_whatsapp_number) {
    throw new Error("Workspace is missing YCloud configuration");
  }

  await sendText({
    apiKey: workspace.ycloud_api_key,
    from: normalizePhone(workspace.ycloud_whatsapp_number),
    to: normalizePhone(contact.phone),
    body,
  });

  const { error: insertError } = await supabase.from("messages").insert({
    workspace_id: workspace.id,
    conversation_id: conversationId,
    direction: "outbound",
    sender: "human",
    type: "text",
    body,
  });

  if (insertError) throw new Error(insertError.message);
  revalidatePath("/inbox");
}
