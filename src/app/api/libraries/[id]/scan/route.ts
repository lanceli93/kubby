import { NextRequest } from "next/server";
import { scanLibrary } from "@/lib/scanner";

// POST /api/libraries/[id]/scan — SSE streaming progress
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const result = await scanLibrary(id, (progress) => {
          send({ current: progress.current, total: progress.total });
        });
        send({ done: true, scannedCount: result.scannedCount });
      } catch (error) {
        console.error("[scan] error:", error);
        send({
          error: error instanceof Error ? error.message : "Scan failed",
        });
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
