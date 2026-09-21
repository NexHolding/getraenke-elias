import { Banknote, Clock3, CircleAlert } from "lucide-react";
import { invoiceState } from "@/lib/billing";
import type { Invoice } from "@/lib/types";
export default function InvoiceStatus({ invoice }: { invoice: Invoice }) {
  const state = invoiceState(invoice);
  const Icon =
    invoice.status === "paid"
      ? Banknote
      : state.tone === "open"
        ? Clock3
        : CircleAlert;
  return (
    <span className={`invoice-status ${state.tone}`}>
      <Icon size={17} />
      {state.label}
    </span>
  );
}
