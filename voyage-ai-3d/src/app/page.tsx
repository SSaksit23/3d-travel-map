import { Globe, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">
      <div className="flex flex-col items-center text-center max-w-xl">
        <div className="size-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 glow">
          <Globe className="size-8 text-white" />
        </div>

        <h1 className="mt-6 text-4xl font-bold text-gradient">Voyage AI 3D</h1>

        <p className="mt-3 text-sm text-muted-foreground">
          Turn any travel document into a living, explorable journey in seconds.
        </p>

        <div className="mt-8 inline-flex items-center gap-2 rounded-full glass px-4 py-2 text-xs text-foreground/80">
          <Sparkles className="size-3.5 text-violet-400" />
          Phase 0 scaffold ready
        </div>
      </div>
    </main>
  );
}
