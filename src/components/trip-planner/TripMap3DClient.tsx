"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { Globe2 } from "lucide-react";
import type { TripLocation, RouteInfo, FlightInfo } from "@/types/trip";

interface TripMap3DClientProps {
  locations: TripLocation[];
  routes: RouteInfo[];
  flights?: FlightInfo[];
  selectedLocationId?: string | null;
  onLocationClick?: (id: string) => void;
  visibleDays?: Set<number>;
  visibleTypes?: Set<string>;
  days?: number[];
  onVisibleDaysChange?: (days: Set<number>) => void;
}

// WebGL globe cannot render during SSR, so load it on the client only.
const TripMap3D = dynamic(() => import("./TripMap3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted/30">
      <span className="text-sm text-muted-foreground">Loading 3D globe...</span>
    </div>
  ),
});

// OpenGlobus throws synchronously from inside React effects when its WebGL
// context or entity buffers get into a bad state. Without a boundary that
// crash unwinds the whole app (white screen in production). This contains it
// to the 3D pane so the 2D map and the rest of the UI keep working.
class Globe3DErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("3D globe crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-muted/30 p-6">
          <div className="max-w-xs text-center space-y-2">
            <Globe2 className="size-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              The 3D globe couldn&apos;t be displayed
            </p>
            <p className="text-xs text-muted-foreground">
              Switch back to the 2D map to keep planning your trip. The 2D view
              also has a 3D buildings mode.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function TripMap3DClient(props: TripMap3DClientProps) {
  return (
    <Globe3DErrorBoundary>
      <TripMap3D {...props} />
    </Globe3DErrorBoundary>
  );
}
