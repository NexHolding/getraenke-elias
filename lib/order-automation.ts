import "server-only";
import { serviceDb } from "./server";
export async function processOrderAutomation() {
  const { data, error } = await serviceDb().rpc("process_order_automation");
  if (error) throw error;
  return data as number;
}
