"use client";

import { useState, useCallback } from "react";
import { Train, Loader2, X, ArrowRight, Clock, Calendar, CheckCircle2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TrainInfo } from "@/types/trip";

interface TrainInputProps {
  isOpen: boolean;
  onClose: () => void;
  onTrainAdd: (train: TrainInfo) => void;
  currentDay: number;
  totalDays: number;
}

interface StationInfo {
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
}

const trainTypeLabels = {
  "high-speed": "High-Speed Rail",
  "normal": "Regular Train",
  "metro": "Metro/Subway",
  "other": "Other",
};

const trainTypeIcons = {
  "high-speed": "🚄",
  "normal": "🚂",
  "metro": "🚇",
  "other": "🚃",
};

export function TrainInput({ isOpen, onClose, onTrainAdd, currentDay, totalDays }: TrainInputProps) {
  // Form fields
  const [trainNumber, setTrainNumber] = useState("");
  const [trainType, setTrainType] = useState<TrainInfo["trainType"]>("high-speed");
  const [departureStation, setDepartureStation] = useState("");
  const [arrivalStation, setArrivalStation] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [selectedDay, setSelectedDay] = useState(currentDay);
  
  // Station data from geocoding
  const [departureStationInfo, setDepartureStationInfo] = useState<StationInfo | null>(null);
  const [arrivalStationInfo, setArrivalStationInfo] = useState<StationInfo | null>(null);
  
  // Loading states
  const [loadingDeparture, setLoadingDeparture] = useState(false);
  const [loadingArrival, setLoadingArrival] = useState(false);
  
  // Error states
  const [departureError, setDepartureError] = useState<string | null>(null);
  const [arrivalError, setArrivalError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Lookup station from geocoding API
  const lookupStation = useCallback(async (query: string, type: "departure" | "arrival") => {
    if (!query || query.length < 2) return;
    
    const setLoading = type === "departure" ? setLoadingDeparture : setLoadingArrival;
    const setStation = type === "departure" ? setDepartureStationInfo : setArrivalStationInfo;
    const setError = type === "departure" ? setDepartureError : setArrivalError;
    
    setLoading(true);
    setError(null);
    
    try {
      // Use geocoding API to find station - try with "railway station" suffix for better results
      const searchQuery = query.toLowerCase().includes("station") ? query : `${query} railway station`;
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      
      // The geocode API returns array directly, not in .results
      if (!response.ok || !Array.isArray(data) || data.length === 0) {
        // Try without "station" suffix as fallback
        const fallbackResponse = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        const fallbackData = await fallbackResponse.json();
        
        if (!fallbackResponse.ok || !Array.isArray(fallbackData) || fallbackData.length === 0) {
          setError("Station not found. Try adding city name.");
          setStation(null);
          return;
        }
        
        const result = fallbackData[0];
        setStation({
          name: result.name,
          city: result.name.split(",")[0].trim(),
          country: result.name.split(",").pop()?.trim() || "",
          lat: result.lat,
          lng: result.lng,
        });
        return;
      }
      
      const result = data[0];
      setStation({
        name: result.name,
        city: result.name.split(",")[0].trim(),
        country: result.name.split(",").pop()?.trim() || "",
        lat: result.lat,
        lng: result.lng,
      });
    } catch (err) {
      console.error("Station lookup error:", err);
      setError("Failed to look up station");
      setStation(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle station input blur - trigger lookup
  const handleDepartureBlur = () => {
    if (departureStation.length >= 2 && departureStation !== departureStationInfo?.name) {
      lookupStation(departureStation, "departure");
    }
  };

  const handleArrivalBlur = () => {
    if (arrivalStation.length >= 2 && arrivalStation !== arrivalStationInfo?.name) {
      lookupStation(arrivalStation, "arrival");
    }
  };

  // Handle Enter key in station fields
  const handleKeyDown = (e: React.KeyboardEvent, type: "departure" | "arrival") => {
    if (e.key === "Enter" || e.key === "Tab") {
      if (type === "departure") {
        handleDepartureBlur();
      } else {
        handleArrivalBlur();
      }
    }
  };

  // Validate and add train
  const handleAddTrain = () => {
    setFormError(null);
    
    // Validate required fields
    if (!trainNumber.trim()) {
      setFormError("Please enter a train number");
      return;
    }
    
    if (!departureStationInfo) {
      setFormError("Please enter a valid departure station");
      return;
    }
    
    if (!arrivalStationInfo) {
      setFormError("Please enter a valid arrival station");
      return;
    }

    // Calculate duration if times are provided
    let duration: number | undefined;
    if (departureTime && arrivalTime) {
      const today = new Date().toISOString().split("T")[0];
      const depDate = new Date(`${today}T${departureTime}`);
      let arrDate = new Date(`${today}T${arrivalTime}`);
      
      // If arrival is before departure, assume next day
      if (arrDate < depDate) {
        arrDate = new Date(arrDate.getTime() + 24 * 60 * 60 * 1000);
      }
      
      duration = Math.round((arrDate.getTime() - depDate.getTime()) / 1000);
    }

    // Create train info
    const train: TrainInfo = {
      id: `train-${Date.now()}`,
      trainNumber: trainNumber.trim().toUpperCase(),
      trainType,
      operator: extractOperator(trainNumber.trim()),
      departure: {
        station: departureStationInfo.name,
        city: departureStationInfo.city,
        country: departureStationInfo.country,
        coordinates: { lat: departureStationInfo.lat, lng: departureStationInfo.lng },
        time: departureTime || undefined,
      },
      arrival: {
        station: arrivalStationInfo.name,
        city: arrivalStationInfo.city,
        country: arrivalStationInfo.country,
        coordinates: { lat: arrivalStationInfo.lat, lng: arrivalStationInfo.lng },
        time: arrivalTime || undefined,
      },
      duration,
      day: selectedDay,
    };

    onTrainAdd(train);
    resetForm();
    onClose();
  };

  // Extract operator name from train number
  const extractOperator = (tn: string): string => {
    const prefixes: Record<string, string> = {
      // China
      "G": "China Railway High-Speed",
      "D": "China Railway CRH",
      "C": "China Railway Intercity",
      "Z": "China Railway Direct Express",
      "T": "China Railway Express",
      "K": "China Railway Fast",
      // Japan
      "N": "Shinkansen",
      // Europe
      "TGV": "SNCF TGV",
      "ICE": "Deutsche Bahn ICE",
      "AVE": "Renfe AVE",
      "ES": "Eurostar",
      // Thailand
      "EXP": "SRT Express",
      "RAP": "SRT Rapid",
      "ORD": "SRT Ordinary",
    };
    
    // Check for prefix matches
    for (const [prefix, operator] of Object.entries(prefixes)) {
      if (tn.toUpperCase().startsWith(prefix)) {
        return operator;
      }
    }
    
    return "Railway";
  };

  const resetForm = () => {
    setTrainNumber("");
    setTrainType("high-speed");
    setDepartureStation("");
    setArrivalStation("");
    setDepartureTime("");
    setArrivalTime("");
    setSelectedDay(currentDay);
    setDepartureStationInfo(null);
    setArrivalStationInfo(null);
    setDepartureError(null);
    setArrivalError(null);
    setFormError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  const isFormValid = departureStationInfo && arrivalStationInfo && trainNumber.trim();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Train className="size-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold">Add Train</h2>
              <p className="text-xs text-muted-foreground">Enter train details for Day {selectedDay}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg hover:bg-accent transition-colors">
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Train Number, Type & Day */}
          <div className="grid grid-cols-[1fr,auto,auto] gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Train Number <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g., G1234, D5678, TGV123"
                value={trainNumber}
                onChange={(e) => setTrainNumber(e.target.value.toUpperCase())}
                className="font-mono text-lg tracking-wider"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block flex items-center gap-1">
                <Zap className="size-3.5" />
                Type
              </label>
              <select
                value={trainType}
                onChange={(e) => setTrainType(e.target.value as TrainInfo["trainType"])}
                className="h-11 px-3 rounded-md border border-input bg-background text-sm font-medium min-w-[100px]"
              >
                {Object.entries(trainTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{trainTypeIcons[value as keyof typeof trainTypeIcons]} {label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block flex items-center gap-1">
                <Calendar className="size-3.5" />
                Day
              </label>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(Number(e.target.value))}
                className="h-11 px-3 rounded-md border border-input bg-background text-sm font-medium min-w-[80px]"
              >
                {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => (
                  <option key={day} value={day}>Day {day}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Departure & Arrival Stations */}
          <div className="grid grid-cols-[1fr,auto,1fr] gap-3 items-start">
            {/* Departure */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                From Station <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Beijing South"
                  value={departureStation}
                  onChange={(e) => {
                    setDepartureStation(e.target.value);
                    setDepartureStationInfo(null);
                    setDepartureError(null);
                  }}
                  onBlur={handleDepartureBlur}
                  onKeyDown={(e) => handleKeyDown(e, "departure")}
                  className="pr-8"
                />
                {loadingDeparture && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                )}
                {departureStationInfo && !loadingDeparture && (
                  <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-green-500" />
                )}
              </div>
              
              {/* Station Info */}
              {departureStationInfo && (
                <div className="mt-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-xs font-medium text-green-600 truncate">{departureStationInfo.name}</p>
                </div>
              )}
              {departureError && (
                <p className="mt-1 text-xs text-red-500">{departureError}</p>
              )}
            </div>

            {/* Arrow */}
            <div className="pt-9">
              <ArrowRight className="size-5 text-muted-foreground" />
            </div>

            {/* Arrival */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                To Station <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Shanghai Hongqiao"
                  value={arrivalStation}
                  onChange={(e) => {
                    setArrivalStation(e.target.value);
                    setArrivalStationInfo(null);
                    setArrivalError(null);
                  }}
                  onBlur={handleArrivalBlur}
                  onKeyDown={(e) => handleKeyDown(e, "arrival")}
                  className="pr-8"
                />
                {loadingArrival && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                )}
                {arrivalStationInfo && !loadingArrival && (
                  <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-green-500" />
                )}
              </div>
              
              {/* Station Info */}
              {arrivalStationInfo && (
                <div className="mt-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-xs font-medium text-green-600 truncate">{arrivalStationInfo.name}</p>
                </div>
              )}
              {arrivalError && (
                <p className="mt-1 text-xs text-red-500">{arrivalError}</p>
              )}
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                <Clock className="size-3.5" />
                Departure Time
              </label>
              <Input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="text-center"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                <Clock className="size-3.5" />
                Arrival Time
              </label>
              <Input
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="text-center"
              />
            </div>
          </div>

          {/* Train Preview */}
          {isFormValid && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-600/10 border border-emerald-500/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{trainTypeIcons[trainType]}</span>
                  <span className="font-bold text-lg">{trainNumber}</span>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">
                  Day {selectedDay}
                </span>
              </div>
              
              <p className="text-sm text-muted-foreground mb-3">
                {trainTypeLabels[trainType]} • {extractOperator(trainNumber)}
              </p>
              
              <div className="flex items-center gap-4">
                <div className="flex-1 text-center">
                  <p className="text-lg font-bold truncate">{departureStationInfo?.city}</p>
                  <p className="text-xs text-muted-foreground truncate">{departureStationInfo?.name}</p>
                  {departureTime && (
                    <p className="text-sm font-medium text-emerald-500 mt-1">{departureTime}</p>
                  )}
                </div>
                
                <ArrowRight className="size-5 text-emerald-500 shrink-0" />
                
                <div className="flex-1 text-center">
                  <p className="text-lg font-bold truncate">{arrivalStationInfo?.city}</p>
                  <p className="text-xs text-muted-foreground truncate">{arrivalStationInfo?.name}</p>
                  {arrivalTime && (
                    <p className="text-sm font-medium text-emerald-500 mt-1">{arrivalTime}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Form Error */}
          {formError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {formError}
            </div>
          )}

          {/* Tips */}
          {!isFormValid && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs text-emerald-400 font-medium mb-1">💡 Tips</p>
              <p className="text-[11px] text-muted-foreground">
                Enter station names (e.g., "Beijing South", "Shanghai Hongqiao", "Tokyo Station").
                Station locations will be found automatically via geocoding.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/50 bg-accent/20 flex gap-2">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleAddTrain}
            disabled={!isFormValid}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          >
            <Train className="size-4 mr-2" />
            Add Train
          </Button>
        </div>
      </div>
    </div>
  );
}
