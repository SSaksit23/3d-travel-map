"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, Image, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExtractedFlight {
  flightNumber: string;
  airline?: string;
  departureAirport?: string;
  departureCode: string;
  arrivalAirport?: string;
  arrivalCode: string;
  departureTime?: string;
  arrivalTime?: string;
  day?: number;
  departureCoordinates?: { lat: number; lng: number };
  arrivalCoordinates?: { lat: number; lng: number };
}

interface ExtractedTrain {
  trainNumber: string;
  trainType?: "high-speed" | "normal" | "metro" | "other";
  operator?: string;
  departureStation: string;
  arrivalStation: string;
  departureTime?: string;
  arrivalTime?: string;
  day?: number;
}

interface DocumentUploadProps {
  onDataExtracted: (data: {
    locations: Array<{
      name: string;
      description?: string;
      address?: string;
      coordinates: { lat: number; lng: number };
      type: string;
      day?: number;
      order?: number;
    }>;
    flights?: ExtractedFlight[];
    trains?: ExtractedTrain[];
    message?: string;
    estimatedDays?: number;
  }) => void;
  isOpen: boolean;
  onClose: () => void;
}

type UploadStatus = "idle" | "uploading" | "processing" | "success" | "error";

interface AgentProgress {
  stage: string;
  status: "running" | "done" | "error" | "skipped";
  message: string;
}

const STAGE_LABELS: Record<string, string> = {
  "document-retrieval": "Extracting entities",
  "itinerary-creator": "Creating itinerary",
  "route-creator": "Calculating routes",
  "flight-connector": "Connecting flights",
};

const STAGE_ORDER: string[] = [
  "document-retrieval",
  "itinerary-creator",
  "route-creator",
  "flight-connector",
];

export function DocumentUpload({ onDataExtracted, isOpen, onClose }: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [agentSteps, setAgentSteps] = useState<AgentProgress[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
  ];

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const validateFile = (file: File): boolean => {
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setErrorMessage("File size must be less than 10MB");
      return false;
    }
    const fileName = file.name.toLowerCase();
    const isValidType =
      acceptedTypes.includes(file.type) ||
      [".pdf", ".docx", ".doc", ".png", ".jpg", ".jpeg", ".webp", ".gif"].some((ext) =>
        fileName.endsWith(ext)
      );
    if (!isValidType) {
      setErrorMessage("Please upload a PDF, Word document, or image file");
      return false;
    }
    return true;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setErrorMessage(null);
    const file = e.dataTransfer.files?.[0];
    if (file && validateFile(file)) setSelectedFile(file);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (file && validateFile(file)) setSelectedFile(file);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;

    setStatus("uploading");
    setErrorMessage(null);
    setResultMessage(null);
    setAgentSteps([]);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      setStatus("processing");
      console.log("[DocumentUpload] Sending file to agent pipeline:", selectedFile.name);

      const response = await fetch("/api/extract-document", {
        method: "POST",
        body: formData,
      });

      console.log("[DocumentUpload] API response status:", response.status);
      const contentType = response.headers.get("content-type") || "";
      console.log("[DocumentUpload] Content-Type:", contentType);
      if (!response.ok || !contentType.includes("ndjson")) {
        const text = await response.text();
        console.error("[DocumentUpload] API error body:", text);
        try {
          const errorData = JSON.parse(text);
          throw new Error(errorData.error || "Failed to process document");
        } catch (e) {
          if (e instanceof SyntaxError) throw new Error(text || "Failed to process document");
          throw e;
        }
      }

      // Read NDJSON stream for progress + result
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalData: Record<string, unknown> | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "progress") {
              setAgentSteps((prev) => {
                const existing = prev.findIndex((s) => s.stage === event.stage);
                const updated: AgentProgress = {
                  stage: event.stage,
                  status: event.status,
                  message: event.message,
                };
                if (existing >= 0) {
                  const copy = [...prev];
                  copy[existing] = updated;
                  return copy;
                }
                return [...prev, updated];
              });
            } else if (event.type === "result") {
              finalData = event;
            } else if (event.type === "error") {
              throw new Error(event.error || event.details || "Pipeline error");
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      // Handle any remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === "result") finalData = event;
        } catch { /* ignore */ }
      }

      if (!finalData) {
        throw new Error("No result received from pipeline");
      }

      const data = finalData as {
        locations?: Array<{
          name: string;
          description?: string;
          address?: string;
          coordinates: { lat: number; lng: number };
          type: string;
          day?: number;
          order?: number;
        }>;
        flights?: ExtractedFlight[];
        trains?: ExtractedTrain[];
        message?: string;
        estimatedDays?: number;
      };

      const locationCount = data.locations?.length || 0;
      const flightCount = data.flights?.length || 0;
      const trainCount = data.trains?.length || 0;
      const totalCount = locationCount + flightCount + trainCount;

      if (totalCount > 0) {
        setStatus("success");
        const parts: string[] = [];
        if (locationCount > 0) parts.push(`${locationCount} location(s)`);
        if (flightCount > 0) parts.push(`${flightCount} flight(s)`);
        if (trainCount > 0) parts.push(`${trainCount} train(s)`);
        setResultMessage(`Found ${parts.join(", ")} in the document!`);

        setTimeout(() => {
          onDataExtracted({ ...data, locations: data.locations ?? [] });
          handleClose();
        }, 1500);
      } else {
        setStatus("error");
        setErrorMessage(data.message || "No travel information found in the document");
      }
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to process document");
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setStatus("idle");
    setErrorMessage(null);
    setResultMessage(null);
    setAgentSteps([]);
    onClose();
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) {
      return <Image className="size-8 text-violet-500" />;
    }
    return <FileText className="size-8 text-blue-500" />;
  };

  const getFileTypeLabel = (file: File) => {
    const fileName = file.name.toLowerCase();
    if (file.type === "application/pdf" || fileName.endsWith(".pdf")) return "PDF";
    if (file.type.includes("wordprocessingml") || fileName.endsWith(".docx")) return "Word";
    if (file.type === "application/msword" || fileName.endsWith(".doc")) return "Word (Legacy)";
    if (file.type.startsWith("image/")) return "Image";
    return "Document";
  };

  if (!isOpen) return null;

  const isProcessing = status === "uploading" || status === "processing";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Upload className="size-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold">Upload Document</h2>
              <p className="text-xs text-muted-foreground">
                Extract locations, flights & trains from your itinerary
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
              transition-all duration-200
              ${dragActive ? "border-violet-500 bg-violet-500/10" : "border-border/50 hover:border-border hover:bg-accent/30"}
              ${selectedFile ? "border-green-500/50 bg-green-500/5" : ""}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.gif"
              onChange={handleFileSelect}
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex flex-col items-center gap-3">
                {getFileIcon(selectedFile)}
                <div>
                  <p className="font-medium text-sm truncate max-w-[250px]">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getFileTypeLabel(selectedFile)} &bull;{" "}
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setStatus("idle");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Change file
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="size-16 rounded-full bg-violet-500/10 flex items-center justify-center">
                  <Upload className="size-8 text-violet-500" />
                </div>
                <div>
                  <p className="font-medium">Drop your file here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports PDF, Word (.docx), and images
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Supported formats */}
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="size-3" /> PDF
            </span>
            <span className="flex items-center gap-1">
              <FileText className="size-3" /> Word
            </span>
            <span className="flex items-center gap-1">
              <Image className="size-3" /> Images
            </span>
          </div>

          {/* Agent Pipeline Progress */}
          {isProcessing && agentSteps.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {STAGE_ORDER.map((stageId, idx) => {
                const step = agentSteps.find((s) => s.stage === stageId);
                const label = STAGE_LABELS[stageId] || stageId;
                const stepNum = idx + 1;

                if (!step) {
                  return (
                    <div key={stageId} className="flex items-center gap-2 text-xs text-muted-foreground/50 pl-1">
                      <div className="size-4 rounded-full border border-border/30 flex items-center justify-center text-[9px]">
                        {stepNum}
                      </div>
                      <span>{label}</span>
                    </div>
                  );
                }

                const isDone = step.status === "done";
                const isRunning = step.status === "running";
                const isError = step.status === "error";
                const isSkipped = step.status === "skipped";

                return (
                  <div
                    key={stageId}
                    className={`flex items-center gap-2 text-xs pl-1 transition-colors ${
                      isDone
                        ? "text-green-500"
                        : isRunning
                          ? "text-violet-500"
                          : isError
                            ? "text-red-500"
                            : "text-muted-foreground"
                    }`}
                  >
                    {isRunning && <Loader2 className="size-4 animate-spin flex-shrink-0" />}
                    {isDone && <CheckCircle className="size-4 flex-shrink-0" />}
                    {isError && <AlertCircle className="size-4 flex-shrink-0" />}
                    {isSkipped && (
                      <div className="size-4 rounded-full border border-current flex items-center justify-center text-[9px]">
                        -
                      </div>
                    )}
                    <span className="font-medium">Agent {stepNum}:</span>
                    <span className="truncate">{step.message}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Generic processing status (before agent events arrive) */}
          {isProcessing && agentSteps.length === 0 && (
            <div className="mt-4 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center gap-2">
              <Loader2 className="size-4 text-violet-500 animate-spin flex-shrink-0" />
              <p className="text-sm text-violet-500">
                {status === "uploading" ? "Uploading document..." : "Starting agent pipeline..."}
              </p>
            </div>
          )}

          {/* Error */}
          {errorMessage && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
              <AlertCircle className="size-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-500">{errorMessage}</p>
            </div>
          )}

          {/* Success */}
          {resultMessage && status === "success" && (
            <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
              <CheckCircle className="size-4 text-green-500 flex-shrink-0" />
              <p className="text-sm text-green-500">{resultMessage}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border/50 bg-accent/20">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isProcessing || status === "success"}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
          >
            {isProcessing ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="size-4 mr-2" />
                Extract Data
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
