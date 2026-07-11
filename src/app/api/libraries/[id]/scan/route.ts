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
          send({ current: progress.current, total: progress.total, title: progress.title });
        });
        if (result.alreadyRunning) {
          // A concurrent scan already holds the lock — report it without erroring.
          send({ done: true, alreadyRunning: true, message: "A scan is already running for this library", scannedCount: 0, removedCount: 0, skippedCount: 0, skipped: [] });
        } else {
          send({ done: true, scannedCount: result.scannedCount, removedCount: result.removedCount, skippedCount: result.skipped.length, skipped: result.skipped });
        }
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
