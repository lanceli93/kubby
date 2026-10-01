import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { deletePhotoItem } from "@/lib/photos/delete-items";

const MAX_IDS = 5000;

// POST /api/photos/delete  { ids: string[] } — admin-only bulk variant of
// DELETE /api/photos/[id] (timeline/album multi-select). Each item is handled
// independently: a file that can't be removed keeps its row and is reported in
// `failed`. Returns { deleted: string[], failed: { id, error }[] }; status 200
// when at least one item was deleted (or nothing failed), else the first
// failure's status.
export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await request.json().catch(() => null);
    const ids: string[] = Array.isArray(body?.ids)
      ? [...new Set(body.ids.filter((x: unknown): x is string => typeof x === "string" && x.length > 0))] as string[]
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }
    if (ids.length > MAX_IDS) {
      return NextResponse.json({ error: `At most ${MAX_IDS} ids per request` }, { status: 400 });
    }

    const deleted: string[] = [];
    const failed: { id: string; error: string }[] = [];
    let firstFailStatus = 500;
    for (const id of ids) {
      const result = deletePhotoItem(id);
      if (result.ok) {
        deleted.push(id);
      } else {
        if (failed.length === 0) firstFailStatus = result.status;
        failed.push({ id, error: result.error });
      }
    }

    const status = deleted.length > 0 || failed.length === 0 ? 200 : firstFailStatus;
    return NextResponse.json(
      { deleted, failed, ...(status !== 200 ? { error: failed[0].error } : {}) },
      { status }
    );
  } catch (error) {
    console.error("Bulk delete photo items error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
