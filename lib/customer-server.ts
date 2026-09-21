import "server-only";
import { userDb, serviceDb } from "./server";
import { provisionCustomer } from "./customer-provision";
export async function signedCustomer() {
  const auth = await userDb();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return provisionCustomer(serviceDb(), user);
}
