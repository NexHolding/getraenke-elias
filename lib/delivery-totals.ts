import type { Delivery } from "./types";
export const returnAmount = (value: Record<string, number>) =>
  Object.entries(value).reduce(
    (sum, [cents, quantity]) => sum + Number(cents) * quantity,
    0,
  );
export const deliveryAmount = (delivery: Delivery) =>
  delivery.total_cents ??
  [...delivery.items, ...(delivery.deposit_returns || [])].reduce(
    (sum, item) =>
      sum + item.quantity * (item.price_cents + (item.deposit_cents || 0)),
    0,
  );
export const deliveryReturnValue = (delivery?: Delivery) =>
  Object.fromEntries(
    (delivery?.deposit_returns || []).map((item) => [
      String(item.deposit_cents),
      -item.quantity,
    ]),
  );
