"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, Loader2, MapPin, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GeocodeResult } from "@/types/trip";

interface LocationSearchProps {
  onLocationSelect: (location: GeocodeResult) => void;
  onAISearch: (query: string) => Promise<void>;
  isLoading?: boolean;
  placeholder?: string;
}

export function LocationSearch({
  onLocationSelect,
  onAISearch,
  isLoading = false,
  placeholder = "Search for a destination...",
}: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Handle clicking outside to close results
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchLocations = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      setResults(data);
      setShowResults(true);
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Debounce the search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchLocations(value);
    }, 300);
  };

  const handleLocationClick = (location: GeocodeResult) => {
    onLocationSelect(location);
    setQuery("");
    setResults([]);
    setShowResults(false);
  };

  const handleAISearch = async () => {
    if (query.trim()) {
      await onAISearch(query);
      setQuery("");
      setResults([]);
      setShowResults(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      handleAISearch();
    }
  };

  return (
    <div ref={searchRef} className="relative w-full" style={{ zIndex: 9999 }}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setShowResults(true)}
            className="pl-10 pr-4 h-12 text-base bg-background/60 backdrop-blur-sm border-border/50 focus:border-primary/50"
            disabled={isLoading}
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button
          onClick={handleAISearch}
          disabled={!query.trim() || isLoading}
          className="h-12 px-6 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="size-4 mr-2" />
          )}
          AI Plan
        </Button>
      </div>

      {/* Search Results Dropdown */}
      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-background/95 backdrop-blur-md border border-border/50 rounded-xl shadow-xl z-[9999] overflow-hidden">
          <div className="max-h-[300px] overflow-y-auto">
            {results.map((result, index) => (
              <button
                key={`${result.lat}-${result.lng}-${index}`}
                onClick={() => handleLocationClick(result)}
                className={cn(
                  "w-full px-4 py-3 flex items-start gap-3 hover:bg-accent/50 transition-colors text-left",
                  index !== results.length - 1 && "border-b border-border/30"
                )}
              >
                <MapPin className="size-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{result.name.split(",")[0]}</p>
                  <p className="text-xs text-muted-foreground truncate">{result.name}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
