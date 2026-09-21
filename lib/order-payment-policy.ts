export function initialOrderPaymentApproval(
  requested: "cash" | "card" | "invoice",
  userId: string | undefined,
  customer: { user_id?: string | null; payment_method?: string | null } | null,
) {
  if (requested !== "invoice") return requested;
  return userId &&
    customer?.user_id === userId &&
    customer.payment_method === "invoice"
    ? "invoice"
    : null;
}
