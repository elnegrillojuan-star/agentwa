import { Badge } from "@/components/ui/badge";
import type { ConversationStatus } from "@/lib/supabase/types";

const LABELS: Record<ConversationStatus, string> = {
  ai_active: "IA activa",
  human_active: "Humano",
  handoff_pending: "Handoff",
  awaiting_user: "Esperando",
  snoozed: "Pausada",
  closed: "Cerrada",
};

const VARIANTS: Record<ConversationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  ai_active: "default",
  human_active: "secondary",
  handoff_pending: "destructive",
  awaiting_user: "outline",
  snoozed: "outline",
  closed: "outline",
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
