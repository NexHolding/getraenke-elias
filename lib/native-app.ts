import { z } from "zod";

export const nativeCartSchema = z.object({
  version: z.literal(1),
  request_id: z.uuid(),
  pending: z.boolean().optional(),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(200)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
    ),
});
export type NativeCart = z.infer<typeof nativeCartSchema>;
declare global {
  interface Window {
    eliasNative?: { version: 1; app: "customer" | "pos" };
    webkit?: {
      messageHandlers?: {
        elias?: { postMessage: (message: unknown) => Promise<unknown> };
      };
    };
  }
}
export function nativeApp() {
  return typeof window !== "undefined" &&
    window.eliasNative?.version === 1 &&
    window.webkit?.messageHandlers?.elias
    ? window.eliasNative.app
    : null;
}
export async function nativeRequest(message: {
  type: string;
  [key: string]: unknown;
}): Promise<unknown> {
  if (!nativeApp()) throw new Error("Native App-Verbindung nicht verfügbar.");
  return window.webkit!.messageHandlers!.elias!.postMessage({
    version: 1,
    ...message,
  });
}
