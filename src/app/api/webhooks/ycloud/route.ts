import { NextResponse } from "next/server";
import { respondToMessage } from "@/lib/agent/respond";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizePhone, sendText } from "@/lib/ycloud/client";
import type { YCloudWebhookEvent } from "@/lib/ycloud/types";
import { verifyYCloudSignature } from "@/lib/ycloud/verify-webhook";

// Day-1 happy path (see ARQUITECTURA-OBJETIVO.md §2): webhook -> normalize ->
// OpenRouter -> reply via YCloud, text only, no buffer yet. One YCloud
// account receives inbound for every workspace's number, so the workspace is
// resolved per-request from `to` before the signature can be checked against
// that workspace's own webhook secret.
export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: YCloudWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.type !== "whatsapp.inbound_message.received" || !event.whatsappInboundMessage) {
    // Other event types (status updates, template updates, etc.) are
    // acknowledged but not processed yet.
    return NextResponse.json({ ok: true });
  }

  const inbound = event.whatsappInboundMessage;
  const businessNumber = normalizePhone(inbound.to);
  const customerNumber = normalizePhone(inbound.from);

  const supabase = createServiceClient();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("ycloud_whatsapp_number", businessNumber)
    .maybeSingle();

  if (!workspace) {
    // Unknown destination number: nothing to do, but still 200 so YCloud
    // doesn't retry indefinitely.
    return NextResponse.json({ ok: true });
  }

  const signatureHeader = request.headers.get("ycloud-signature");
  if (
    !workspace.ycloud_webhook_secret ||
    !verifyYCloudSignature(rawBody, signatureHeader, workspace.ycloud_webhook_secret)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { data: contact } = await supabase
    .from("contacts")
    .upsert(
      {
        workspace_id: workspace.id,
        phone: customerNumber,
        name: inbound.customerProfile?.name,
        last_interaction_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,phone" },
    )
    .select("*")
    .single();

  if (!contact) {
    return NextResponse.json({ error: "Failed to upsert contact" }, { status: 500 });
  }

  const { data: existingConversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("contact_id", contact.id)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const windowExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: conversation } = existingConversation
    ? await supabase
        .from("conversations")
        .update({ window_expires_at: windowExpiresAt })
        .eq("id", existingConversation.id)
        .select("*")
        .single()
    : await supabase
        .from("conversations")
        .insert({
          workspace_id: workspace.id,
          contact_id: contact.id,
          status: "ai_active",
          window_expires_at: windowExpiresAt,
        })
        .select("*")
        .single();

  if (!conversation) {
    return NextResponse.json({ error: "Failed to resolve conversation" }, { status: 500 });
  }

  const messageBody = inbound.type === "text" ? inbound.text?.body ?? "" : null;
  const mediaUrl =
    inbound.type === "audio"
      ? inbound.audio?.link
      : inbound.type === "image"
        ? inbound.image?.link
        : inbound.type === "document"
          ? inbound.document?.link
          : undefined;

  await supabase.from("messages").insert({
    workspace_id: workspace.id,
    conversation_id: conversation.id,
    direction: "inbound",
    sender: "contact",
    type: inbound.type,
    body: messageBody,
    media_url: mediaUrl,
    wamid: inbound.id,
  });

  // Non-text message types (audio/image/document) are stored for the inbox
  // but not yet sent to the model — transcription/captioning lands with the
  // buffer layer.
  if (inbound.type !== "text" || !messageBody || conversation.status !== "ai_active") {
    return NextResponse.json({ ok: true });
  }

  if (!workspace.ycloud_api_key) {
    return NextResponse.json({ ok: true, warning: "No YCloud API key configured" });
  }

  try {
    const replyText = await respondToMessage({
      workspace,
      conversation,
      contact,
      userMessage: messageBody,
    });

    if (replyText) {
      await sendText({
        apiKey: workspace.ycloud_api_key,
        from: businessNumber,
        to: customerNumber,
        body: replyText,
      });

      await supabase.from("messages").insert({
        workspace_id: workspace.id,
        conversation_id: conversation.id,
        direction: "outbound",
        sender: "ai",
        type: "text",
        body: replyText,
      });
    }
  } catch (error) {
    console.error("Agent response failed", error);
    return NextResponse.json({ ok: true, warning: "Agent response failed" });
  }

  return NextResponse.json({ ok: true });
}
