"use client";

import { useState, useCallback, useEffect } from "react";
import { Plane, Loader2, X, ArrowRight, Clock, Calendar, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FlightInfo } from "@/types/trip";

interface FlightInputProps {
  isOpen: boolean;
  onClose: () => void;
  onFlightAdd: (flight: FlightInfo) => void;
  onFlightEdit?: (flight: FlightInfo) => void;
  currentDay: number;
  totalDays: number;
  editFlight?: FlightInfo | null; // Flight to edit (null = add mode)
}

interface AirportInfo {
  name: string;
  iata: string;
  icao: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
}

export function FlightInput({ isOpen, onClose, onFlightAdd, onFlightEdit, currentDay, totalDays, editFlight }: FlightInputProps) {
  const isEditMode = !!editFlight;
  
  // Form fields
  const [flightNumber, setFlightNumber] = useState("");
  const [departureCode, setDepartureCode] = useState("");
  const [arrivalCode, setArrivalCode] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [selectedDay, setSelectedDay] = useState(currentDay);
  
  // Airport data from API
  const [departureAirport, setDepartureAirport] = useState<AirportInfo | null>(null);
  const [arrivalAirport, setArrivalAirport] = useState<AirportInfo | null>(null);
  
  // Loading states
  const [loadingDeparture, setLoadingDeparture] = useState(false);
  const [loadingArrival, setLoadingArrival] = useState(false);
  
  // Error states
  const [departureError, setDepartureError] = useState<string | null>(null);
  const [arrivalError, setArrivalError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (editFlight && isOpen) {
      setFlightNumber(editFlight.flightNumber);
      setDepartureCode(editFlight.departure.iata);
      setArrivalCode(editFlight.arrival.iata);
      setDepartureTime(editFlight.departure.scheduledTime || editFlight.departure.time || "");
      setArrivalTime(editFlight.arrival.scheduledTime || editFlight.arrival.time || "");
      setSelectedDay(editFlight.day || currentDay);
      
      // Set airport info from existing flight
      setDepartureAirport({
        name: editFlight.departure.airport,
        iata: editFlight.departure.iata,
        icao: editFlight.departure.icao || "",
        city: editFlight.departure.city,
        country: editFlight.departure.country || "",
        lat: editFlight.departure.coordinates.lat,
        lng: editFlight.departure.coordinates.lng,
      });
      setArrivalAirport({
        name: editFlight.arrival.airport,
        iata: editFlight.arrival.iata,
        icao: editFlight.arrival.icao || "",
        city: editFlight.arrival.city,
        country: editFlight.arrival.country || "",
        lat: editFlight.arrival.coordinates.lat,
        lng: editFlight.arrival.coordinates.lng,
      });
    }
  }, [editFlight, isOpen, currentDay]);

  // Lookup airport from API
  const lookupAirport = useCallback(async (code: string, type: "departure" | "arrival") => {
    if (!code || code.length < 3) return;
    
    const setLoading = type === "departure" ? setLoadingDeparture : setLoadingArrival;
    const setAirport = type === "departure" ? setDepartureAirport : setArrivalAirport;
    const setError = type === "departure" ? setDepartureError : setArrivalError;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/airport?code=${code.trim()}`);
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || "Airport not found");
        setAirport(null);
        return;
      }
      
      setAirport(data);
    } catch (err) {
      console.error("Airport lookup error:", err);
      setError("Failed to look up airport");
      setAirport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle airport code input blur - trigger lookup
  const handleDepartureBlur = () => {
    if (departureCode.length >= 3 && departureCode !== departureAirport?.iata && departureCode !== departureAirport?.icao) {
      lookupAirport(departureCode, "departure");
    }
  };

  const handleArrivalBlur = () => {
    if (arrivalCode.length >= 3 && arrivalCode !== arrivalAirport?.iata && arrivalCode !== arrivalAirport?.icao) {
      lookupAirport(arrivalCode, "arrival");
    }
  };

  // Handle Enter key in airport fields
  const handleKeyDown = (e: React.KeyboardEvent, type: "departure" | "arrival") => {
    if (e.key === "Enter" || e.key === "Tab") {
      if (type === "departure") {
        handleDepartureBlur();
      } else {
        handleArrivalBlur();
      }
    }
  };

  // Validate and add/edit flight
  const handleAddFlight = () => {
    setFormError(null);
    
    // Validate required fields
    if (!flightNumber.trim()) {
      setFormError("Please enter a flight number");
      return;
    }
    
    if (!departureAirport) {
      setFormError("Please enter a valid departure airport");
      return;
    }
    
    if (!arrivalAirport) {
      setFormError("Please enter a valid arrival airport");
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

    // Create flight info (preserve ID if editing)
    const flight: FlightInfo = {
      id: isEditMode ? editFlight.id : `flight-${Date.now()}`,
      flightNumber: flightNumber.trim().toUpperCase(),
      airline: extractAirline(flightNumber.trim()),
      departure: {
        airport: departureAirport.name,
        iata: departureAirport.iata,
        city: departureAirport.city || departureAirport.country,
        coordinates: { lat: departureAirport.lat, lng: departureAirport.lng },
        scheduledTime: departureTime || undefined,
      },
      arrival: {
        airport: arrivalAirport.name,
        iata: arrivalAirport.iata,
        city: arrivalAirport.city || arrivalAirport.country,
        coordinates: { lat: arrivalAirport.lat, lng: arrivalAirport.lng },
        scheduledTime: arrivalTime || undefined,
      },
      status: isEditMode ? editFlight.status : "Scheduled",
      duration,
      day: selectedDay,
    };

    if (isEditMode && onFlightEdit) {
      onFlightEdit(flight);
    } else {
      onFlightAdd(flight);
    }
    resetForm();
    onClose();
  };

  // Extract airline name from flight number
  const extractAirline = (fn: string): string => {
    const codes: Record<string, string> = {
      "CZ": "China Southern", "MU": "China Eastern", "CA": "Air China",
      "TG": "Thai Airways", "FD": "Thai AirAsia", "SL": "Thai Lion Air",
      "DD": "Nok Air", "PG": "Bangkok Airways", "WE": "Thai Smile",
      "SQ": "Singapore Airlines", "TR": "Scoot", "3K": "Jetstar Asia",
      "CX": "Cathay Pacific", "HX": "Hong Kong Airlines", "UO": "HK Express",
      "JL": "Japan Airlines", "NH": "ANA", "MM": "Peach",
      "KE": "Korean Air", "OZ": "Asiana", "7C": "Jeju Air",
      "VN": "Vietnam Airlines", "VJ": "VietJet", "QH": "Bamboo Airways",
      "AK": "AirAsia", "D7": "AirAsia X", "QZ": "AirAsia Indonesia",
      "QR": "Qatar Airways", "EK": "Emirates", "EY": "Etihad",
      "LH": "Lufthansa", "BA": "British Airways", "AF": "Air France",
      "AA": "American", "UA": "United", "DL": "Delta",
      "3U": "Sichuan Airlines", "HU": "Hainan Airlines", "ZH": "Shenzhen Airlines",
    };
    const code = fn.substring(0, 2).toUpperCase();
    return codes[code] || `${code} Airlines`;
  };

  const resetForm = () => {
    setFlightNumber("");
    setDepartureCode("");
    setArrivalCode("");
    setDepartureTime("");
    setArrivalTime("");
    setSelectedDay(currentDay);
    setDepartureAirport(null);
    setArrivalAirport(null);
    setDepartureError(null);
    setArrivalError(null);
    setFormError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  const isFormValid = departureAirport && arrivalAirport && flightNumber.trim();

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
            <div className={`size-10 rounded-xl flex items-center justify-center ${isEditMode ? "bg-gradient-to-br from-amber-500 to-orange-600" : "bg-gradient-to-br from-sky-500 to-blue-600"}`}>
              {isEditMode ? <Pencil className="size-5 text-white" /> : <Plane className="size-5 text-white" />}
            </div>
            <div>
              <h2 className="font-semibold">{isEditMode ? "Edit Flight" : "Add Flight"}</h2>
              <p className="text-xs text-muted-foreground">
                {isEditMode ? `Editing ${editFlight?.flightNumber}` : `Enter flight details for Day ${currentDay}`}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg hover:bg-accent transition-colors">
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Flight Number & Day Selector */}
          <div className="grid grid-cols-[1fr,auto] gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Flight Number <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g., FD540, CZ361, TG668"
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                className="font-mono text-lg tracking-wider"
              />
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

          {/* Departure & Arrival Airports */}
          <div className="grid grid-cols-[1fr,auto,1fr] gap-3 items-start">
            {/* Departure */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                From <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="BKK"
                  value={departureCode}
                  onChange={(e) => {
                    setDepartureCode(e.target.value.toUpperCase());
                    setDepartureAirport(null);
                    setDepartureError(null);
                  }}
                  onBlur={handleDepartureBlur}
                  onKeyDown={(e) => handleKeyDown(e, "departure")}
                  maxLength={4}
                  className="font-mono text-xl tracking-wider text-center pr-8"
                />
                {loadingDeparture && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                )}
                {departureAirport && !loadingDeparture && (
                  <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-green-500" />
                )}
              </div>
              
              {/* Airport Info */}
              {departureAirport && (
                <div className="mt-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-xs font-medium text-green-600 truncate">{departureAirport.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{departureAirport.city}, {departureAirport.country}</p>
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
                To <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="CAN"
                  value={arrivalCode}
                  onChange={(e) => {
                    setArrivalCode(e.target.value.toUpperCase());
                    setArrivalAirport(null);
                    setArrivalError(null);
                  }}
                  onBlur={handleArrivalBlur}
                  onKeyDown={(e) => handleKeyDown(e, "arrival")}
                  maxLength={4}
                  className="font-mono text-xl tracking-wider text-center pr-8"
                />
                {loadingArrival && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                )}
                {arrivalAirport && !loadingArrival && (
                  <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 size-4 text-green-500" />
                )}
              </div>
              
              {/* Airport Info */}
              {arrivalAirport && (
                <div className="mt-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-xs font-medium text-green-600 truncate">{arrivalAirport.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{arrivalAirport.city}, {arrivalAirport.country}</p>
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

          {/* Flight Preview */}
          {isFormValid && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-sky-500/10 to-blue-600/10 border border-sky-500/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Plane className="size-5 text-sky-500" />
                  <span className="font-bold text-lg">{flightNumber}</span>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-sky-500/20 text-sky-400">
                  Day {selectedDay}
                </span>
              </div>
              
              <p className="text-sm text-muted-foreground mb-3">{extractAirline(flightNumber)}</p>
              
              <div className="flex items-center gap-4">
                <div className="flex-1 text-center">
                  <p className="text-2xl font-bold">{departureAirport?.iata || departureCode}</p>
                  <p className="text-xs text-muted-foreground truncate">{departureAirport?.city}</p>
                  {departureTime && (
                    <p className="text-sm font-medium text-sky-500 mt-1">{departureTime}</p>
                  )}
                </div>
                
                <ArrowRight className="size-5 text-sky-500 shrink-0" />
                
                <div className="flex-1 text-center">
                  <p className="text-2xl font-bold">{arrivalAirport?.iata || arrivalCode}</p>
                  <p className="text-xs text-muted-foreground truncate">{arrivalAirport?.city}</p>
                  {arrivalTime && (
                    <p className="text-sm font-medium text-sky-500 mt-1">{arrivalTime}</p>
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
            <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/20">
              <p className="text-xs text-sky-400 font-medium mb-1">💡 Tips</p>
              <p className="text-[11px] text-muted-foreground">
                Enter airport codes (IATA: 3 letters like BKK, or ICAO: 4 letters like VTBS). 
                Airport data is fetched from a database of 30,000+ airports worldwide.
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
            onClick={handleAddFlight}
            disabled={!isFormValid}
            className={`flex-1 ${isEditMode ? "bg-amber-600 hover:bg-amber-700" : "bg-sky-600 hover:bg-sky-700"}`}
          >
            {isEditMode ? <Pencil className="size-4 mr-2" /> : <Plane className="size-4 mr-2" />}
            {isEditMode ? "Save Changes" : "Add Flight"}
          </Button>
        </div>
      </div>
    </div>
  );
}
