/**
 * Document Extraction API Route
 * Uses the 4-agent pipeline:
 *   1. Document Retrieval → 2. Itinerary Creator → 3. Route Creator → 4. Flight Connector
 * Streams progress via NDJSON, final line is the result.
 * Falls back to fast single-pass extraction when ?pipeline=fast.
 */

import mammoth from "mammoth";
import { AgentCoordinator } from "@/lib/agents/agent-coordinator";
import { fastExtract, fastExtractFromImage } from "./fast-extract";
import type { PipelineProgress, FinalItinerary } from "@/lib/agents/types";

async function extractTextFromDocument(
  buffer: Buffer,
  fileType: "pdf" | "docx"
): Promise<string> {
  console.log(`[API] Extracting text from ${fileType.toUpperCase()} using Node.js...`);
  try {
    if (fileType === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      console.log(`[API] Extracted ${text.length} chars from ${pdf.numPages} pages`);
      return text;
    } else {
      try {
        const result = await mammoth.extractRawText({ buffer });
        console.log(`[API] Extracted ${result.value.length} chars from DOCX`);
        return result.value;
      } catch (docxErr) {
        console.error("[API] mammoth failed, might be old .doc format:", docxErr);
        throw new Error(
          "Could not read this Word file. If it is an old .doc file, please re-save it as .docx in Microsoft Word or Google Docs, then upload again."
        );
      }
    }
  } catch (error) {
    console.error("[API] Document extraction error:", error);
    throw new Error(`${error instanceof Error ? error.message : String(error)}`);
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Convert FinalItinerary to the flat format the frontend expects.
 */
function transformPipelineResult(result: FinalItinerary) {
  const locations: Array<{
    name: string;
    description: string;
    address: string;
    coordinates: { lat: number; lng: number };
    type: string;
    day: number;
    order: number;
  }> = [];

  let globalOrder = 0;
  for (const day of result.days) {
    for (const loc of day.locations) {
      locations.push({
        name: loc.name,
        description: loc.description || "",
        address: "",
        coordinates: loc.coordinates,
        type: loc.type,
        day: day.dayNumber,
        order: globalOrder++,
      });
    }
  }

  // Map resolved flights to the format DocumentUpload expects
  const flights = result.resolvedFlights.map((f) => ({
    flightNumber: f.flightNumber,
    airline: f.airline,
    departureAirport: f.departure.airport,
    departureCode: f.departure.iata,
    arrivalAirport: f.arrival.airport,
    arrivalCode: f.arrival.iata,
    departureTime: f.departure.time,
    arrivalTime: f.arrival.time,
    day: f.day,
    // Pre-resolved coordinates so the frontend doesn't need to look them up again
    departureCoordinates: f.departure.coordinates,
    arrivalCoordinates: f.arrival.coordinates,
  }));

  return {
    locations,
    flights,
    trains: result.trains,
    tripType: result.tripType,
    estimatedDays: result.estimatedDays,
    message: result.message,
    _pipeline: "agents",
  };
}

export async function POST(request: Request) {
  const startTime = Date.now();
  const url = new URL(request.url);
  const useFastMode = url.searchParams.get("pipeline") === "fast";
  console.log(`[API] Document extraction request (pipeline=${useFastMode ? "fast" : "agents"})`);

  try {
    if (!process.env.OPENAI_API_KEY) {
      return jsonResponse({ error: "OpenAI API key not configured" }, 500);
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const context = formData.get("context") as string | null;

    if (!file) {
      return jsonResponse({ error: "No file provided" }, 400);
    }

    console.log(`[API] Processing file: ${file.name} (${file.type})`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();
    const mimeType = file.type;

    let documentText: string | undefined;
    let imageData: { base64: string; mimeType: string } | undefined;

    const isWord = fileName.endsWith(".docx") || fileName.endsWith(".doc") ||
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword";

    if (fileName.endsWith(".pdf") || mimeType === "application/pdf") {
      documentText = await extractTextFromDocument(buffer, "pdf");
    } else if (isWord) {
      documentText = await extractTextFromDocument(buffer, "docx");
    } else if (
      mimeType.startsWith("image/") ||
      [".png", ".jpg", ".jpeg", ".webp", ".gif"].some((ext) => fileName.endsWith(ext))
    ) {
      imageData = { base64: buffer.toString("base64"), mimeType: mimeType || "image/jpeg" };
    } else {
      return jsonResponse({ error: "Unsupported file type." }, 400);
    }

    if (!documentText && !imageData) {
      return jsonResponse({ error: "No content could be extracted from the file" }, 400);
    }
    if (documentText && documentText.trim().length === 0) {
      return jsonResponse({ error: "Extracted text is empty" }, 400);
    }
    if (documentText && context) {
      documentText = `[User Context: ${context}]\n\n${documentText}`;
    }

    // --- Fast single-pass mode (legacy fallback) ---
    if (useFastMode) {
      console.log("[API] Using fast single-pass extraction");
      try {
        const result = imageData
          ? await fastExtractFromImage(imageData.base64, imageData.mimeType)
          : await fastExtract(documentText!);

        const locations = result.locations.map((loc, idx) => ({
          name: loc.name,
          description: loc.description || "",
          address: "",
          coordinates: loc.coordinates || { lat: 0, lng: 0 },
          type: loc.type,
          day: loc.day,
          order: idx,
        }));

        return jsonResponse({
          locations,
          flights: result.flights,
          trains: result.trains,
          tripType: result.tripType,
          estimatedDays: result.estimatedDays,
          message: `Extracted: ${locations.length} locations`,
          _extractionTimeMs: Date.now() - startTime,
          _pipeline: "fast",
        });
      } catch (err) {
        return jsonResponse({ error: "Fast extraction failed", details: String(err) }, 500);
      }
    }

    // --- Agent pipeline mode (default) with streaming progress ---
    const progressEvents: PipelineProgress[] = [];
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (p: PipelineProgress) => {
          progressEvents.push(p);
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "progress", ...p }) + "\n")
          );
        };

        try {
          const coordinator = new AgentCoordinator({
            apiKeys: {
              openai: process.env.OPENAI_API_KEY,
              apiNinjas: process.env.API_NINJAS_KEY,
            },
            verbose: true,
            onProgress: sendProgress,
          });

          const pipelineResult = await coordinator.processDocument({
            text: documentText,
            imageData,
          });

          const transformed = transformPipelineResult(pipelineResult);
          transformed._pipeline = "agents";
          (transformed as Record<string, unknown>)._extractionTimeMs = Date.now() - startTime;

          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "result", ...transformed }) + "\n")
          );
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                error: "Pipeline failed",
                details: String(err),
              }) + "\n"
            )
          );
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    console.error("[API] Document extraction error:", msg);
    console.error("[API] Stack:", stack);
    return jsonResponse(
      { error: `Extraction failed: ${msg}` },
      500
    );
  }
}
