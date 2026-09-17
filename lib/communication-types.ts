export type Communication = {
  id: string;
  kind: string;
  recipient: string;
  sender: string;
  subject: string;
  body: string;
  status: "pending" | "sending" | "sent" | "failed" | "uncertain";
  error: string | null;
  created_at: string;
  sent_at: string | null;
  legacy: boolean;
  attachments: {
    id: string;
    filename: string;
    size_bytes: number;
    sha256: string;
  }[];
};
export const mailStatus = {
  pending: "Versand vorgemerkt",
  sending: "Versand läuft",
  sent: "An Mailserver übergeben",
  failed: "Nicht versendet",
  uncertain: "Versandstatus unklar",
};
