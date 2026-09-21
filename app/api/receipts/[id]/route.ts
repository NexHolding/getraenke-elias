import { z } from "zod";
import { requireStaff, serviceDb, safeError, sameOrigin } from "@/lib/server";
import { can, financeReadOnly } from "@/lib/permissions";
import { receiptArchive, archivedPdf } from "@/lib/receipt-archive";
async function access(id: string) {
  z.uuid().parse(id);
  const staff = await requireStaff();
  if (!can(staff, "kasse") && !can(staff, "finanzen") && !can(staff,"storno"))
    throw new Error("FORBIDDEN");
  const { data: sale, error } = await serviceDb()
    .from("sales")
    .select("*")
    .eq("id", id)
    .single();
  if (
    error ||
    !sale ||
    !(sale.actor === staff.user.id || can(staff, "finanzen") || can(staff,"storno"))
  )
    throw new Error("FORBIDDEN");
  return { sale, staff };
}
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { sale } = await access(id);
    const doc = await receiptArchive(sale);
    if (new URL(req.url).searchParams.get("format") === "pdf")
      return archivedPdf(doc, `Elias-Bon-${sale.number}.pdf`);
    const db = serviceDb();
    const [workflow, jobs] = await Promise.all([
      db.from("receipt_workflows").select("*").eq("sale_id", id).maybeSingle(),
      db
        .from("receipt_print_jobs")
        .select("id,status,copy,detail,created_at")
        .eq("sale_id", id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (workflow.error || jobs.error)
      throw new Error("Receipt status unavailable");
    return Response.json(
      {
        sale,
        workflow: workflow.data,
        jobs: jobs.data,
        archived_at: doc.created_at,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const { id } = await params;
    const { sale, staff } = await access(id);
    if (financeReadOnly(staff)) throw new Error("FORBIDDEN");
    const body = z
      .object({
        action: z.enum([
          "digital",
          "digital_offered",
          "print_start",
          "print_finish",
          "manual_paper",
        ]),
        value: z
          .object({
            job_id: z.uuid().optional(),
            confirm_copy: z.boolean().optional(),
            consent: z.boolean().optional(),
            confirmed: z.boolean().optional(),
            status: z.enum(["confirmed", "failed", "unknown"]).optional(),
            detail: z.string().max(500).optional(),
          })
          .default({}),
      })
      .parse(await req.json());
    await receiptArchive(sale);
    const { data, error } = await serviceDb().rpc("receipt_command", {
      p_sale: id,
      p_actor: staff.user.id,
      p_action: body.action,
      p_value: body.value,
    });
    if (error) throw new Error(error.message);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return safeError(e);
  }
}
