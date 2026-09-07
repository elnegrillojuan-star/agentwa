import { z } from "zod";
import type { Tool } from "./types";

const schema = z.object({});

// Reference implementation of the Tool contract: returns what the CRM
// already knows about the contact in the current conversation. Later tools
// (HighLevel, KB search, scheduling, custom_webhook) follow this same shape.
export const obtenerInfoCliente: Tool<z.infer<typeof schema>> = {
  name: "obtenerInfoCliente",
  description:
    "Devuelve los datos conocidos del cliente actual (nombre, etiquetas, stage, campos personalizados).",
  schema,
  enabledFor: () => true,
  async run(_args, ctx) {
    const { contact } = ctx;
    return {
      ok: true,
      data: {
        nombre: contact.name,
        telefono: contact.phone,
        etiquetas: contact.tags,
        stage: contact.stage,
        campos_personalizados: contact.custom_fields,
      },
    };
  },
};
