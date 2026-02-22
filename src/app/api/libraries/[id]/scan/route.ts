import { NextRequest } from "next/server";
import { scanLibrary } from "@/lib/scanner";
import { setScanProgress, clearScan } from "@/lib/scan-state";

// POST /api/libraries/[id]/scan — SSE streaming progress
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Mark scan as started in global state
  setScanProgress(id, { status: "scanning", current: 0, total: 0 });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const result = await scanLibrary(id, (progress) => {
          setScanProgress(id, {
            current: progress.current,
            total: progress.total,
          });
          send({ current: progress.current, total: progress.total });
        });
        setScanProgress(id, {
          status: "done",
          scannedCount: result.scannedCount,
        });
        send({ done: true, scannedCount: result.scannedCount });
        // Keep "done" visible for 5 seconds, then clean up
        setTimeout(() => clearScan(id), 5000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Scan failed";
        setScanProgress(id, { status: "error", error: msg });
        send({ error: msg });
        setTimeout(() => clearScan(id), 5000);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
