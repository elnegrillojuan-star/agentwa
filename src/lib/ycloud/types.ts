// Shapes confirmed against YCloud's WhatsApp API v2 (see docs.ycloud.com and
// github.com/YCloud-Developers/ycloud-whatsapp-mcp-server/ycloud-api-v2.yaml).

export type YCloudInboundMessageType = "text" | "audio" | "image" | "document";

export interface YCloudMediaRef {
  id?: string;
  link?: string;
  caption?: string;
  filename?: string;
}

export interface YCloudInboundMessage {
  id: string;
  wabaId: string;
  from: string;
  to: string;
  customerProfile?: { name?: string };
  sendTime: string;
  type: YCloudInboundMessageType;
  text?: { body: string };
  audio?: YCloudMediaRef;
  image?: YCloudMediaRef;
  document?: YCloudMediaRef;
}

export interface YCloudWebhookEvent {
  id: string;
  type: string;
  apiVersion: string;
  createTime: string;
  whatsappInboundMessage?: YCloudInboundMessage;
}
