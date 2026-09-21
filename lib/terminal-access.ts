import { can, type StaffAccess } from "./permissions";
import { isSystemAccountEmail } from "./account-visibility";

export type TerminalStaff = StaffAccess & {
  user_id: string;
  name: string;
  email: string;
  number: number;
  pin_hash: string | null;
};

export function canUseTerminal(staff: StaffAccess) {
  return staff.active === true && can(staff, "kasse");
}

/** Only safe, displayable fields leave the paired terminal endpoint. */
export function terminalRoster(staff: TerminalStaff[]) {
  return staff.filter(canUseTerminal).map((person) => ({
    user_id: person.user_id,
    name: isSystemAccountEmail(person.email) ? "Administration" : person.name,
    number: person.number,
    has_pin: Boolean(person.pin_hash),
  })).sort((a, b) => a.name.localeCompare(b.name, "de"));
}
