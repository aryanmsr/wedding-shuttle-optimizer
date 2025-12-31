"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Trash2,
  Wand2,
  Car,
  Clock,
  Users,
  AlertTriangle,
} from "lucide-react";

/**
 * Shuttle Optimizer
 * Open-source UI for batching + scheduling problems solved via CP-SAT.
 */

const DEFAULT_ENDPOINT = "https://wedding-shuttle-optimizer.onrender.com/solve"

/* ---------------- Utilities ---------------- */

function minutesToHHMM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}

function hhmmToMinutes(hhmm: string) {
  const parts = hhmm.trim().split(":");
  if (parts.length !== 2) return NaN;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

function clampInt(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/* ---------------- Types ---------------- */

type GuestRow = {
  guest_id: string;
  name: string;
  arrival_min: number;
};

type TogetherRule = {
  guest_id_a: string;
  guest_id_b: string;
  vehicle_index: number;
};

type SolveResponse = {
  status: "ok" | "infeasible";
  reason?: string;
  num_guests?: number;
  num_vehicles?: number;
  vehicle_capacities?: number[];
  max_wait_min?: number;
  round_trip_min?: number;
  num_trips_used?: number;
  total_wait_min?: number;
  trips?: Array<{
    trip_index: number;
    vehicle_index: number;
    vehicle_capacity?: number | null;
    departure_min: number;
    min_arrival_min: number;
    max_arrival_min: number;
    num_guests: number;
    guests: Array<{
      guest_id: string;
      name: string;
      arrival_min: number;
      wait_min: number;
    }>;
  }>;
};

/* ---------------- Seed data (generic) ---------------- */

const seedGuests: GuestRow[] = [
  { guest_id: "G1", name: "Guest 1", arrival_min: 0 },
  { guest_id: "G2", name: "Guest 2", arrival_min: 300 },
  { guest_id: "G3", name: "Guest 3", arrival_min: 300 },
  { guest_id: "G4", name: "Guest 4", arrival_min: 420 },
  { guest_id: "G5", name: "Guest 5", arrival_min: 480 },
  { guest_id: "G6", name: "Guest 6", arrival_min: 700 },
];

/* ---------------- Component ---------------- */

export default function ShuttleOptimizerApp() {
  const [aboutOpen, setAboutOpen] = useState(false);

  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);

  // Core settings
  const [numCars, setNumCars] = useState(3);
  const [capacityPerCar, setCapacityPerCar] = useState(9); // legacy field for backend compatibility
  const [roundTripMin, setRoundTripMin] = useState(240);
  const [maxWaitMin, setMaxWaitMin] = useState(90);

  // Vehicle capacity customization
  const [useVehicleCaps, setUseVehicleCaps] = useState(true);
  const [vehicleCaps, setVehicleCaps] = useState<number[]>([4, 9, 9]);

  // Guests
  const [guests, setGuests] = useState<GuestRow[]>(seedGuests);
  const [newGuestId, setNewGuestId] = useState("");
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestTime, setNewGuestTime] = useState("00:00");

  // Constraints
  const [togetherEnabled, setTogetherEnabled] = useState(false);
  const [togetherRule, setTogetherRule] = useState<TogetherRule>({
    guest_id_a: "G1",
    guest_id_b: "G2",
    vehicle_index: 0,
  });

  const [incompatEnabled, setIncompatEnabled] = useState(false);
  const [incompatA, setIncompatA] = useState("G2");
  const [incompatB, setIncompatB] = useState("G3");
  const [incompatiblePairs, setIncompatiblePairs] = useState<[string, string][]>(
    []
  );

  // Solve state
  const [isSolving, setIsSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SolveResponse | null>(null);

  const guestIds = useMemo(() => guests.map((g) => g.guest_id), [guests]);

  const computedVehicleCaps = useMemo(() => {
    // Keep length in sync with numCars.
    const caps = [...vehicleCaps];
    if (caps.length < numCars) {
      for (let i = caps.length; i < numCars; i++) caps.push(capacityPerCar);
    }
    return caps
      .slice(0, numCars)
      .map((c) => clampInt(Number(c), 1, 60));
  }, [vehicleCaps, numCars, capacityPerCar]);

  const validation = useMemo(() => {
    const issues: string[] = [];
    const idSet = new Set<string>();

    for (const g of guests) {
      if (!g.guest_id.trim()) issues.push("Guest ID cannot be empty.");
      if (idSet.has(g.guest_id)) issues.push(`Duplicate guest_id: ${g.guest_id}`);
      idSet.add(g.guest_id);
      if (!Number.isFinite(g.arrival_min)) issues.push(`Invalid arrival_min for ${g.guest_id}`);
      if (g.arrival_min < 0) issues.push(`arrival_min must be >= 0 for ${g.guest_id}`);
    }

    if (numCars < 1) issues.push("num_cars must be at least 1.");
    if (capacityPerCar < 1) issues.push("capacity_per_car must be at least 1.");
    if (roundTripMin < 1) issues.push("round_trip_min must be at least 1.");
    if (maxWaitMin < 0) issues.push("max_wait_min must be >= 0.");

    if (useVehicleCaps) {
      if (computedVehicleCaps.length !== numCars)
        issues.push("vehicle_capacities length must match num_cars.");
      if (computedVehicleCaps.some((c) => c < 1))
        issues.push("vehicle capacities must be >= 1.");
    }

    if (togetherEnabled) {
      if (!guestIds.includes(togetherRule.guest_id_a))
        issues.push(`Together rule: unknown guest_id_a (${togetherRule.guest_id_a}).`);
      if (!guestIds.includes(togetherRule.guest_id_b))
        issues.push(`Together rule: unknown guest_id_b (${togetherRule.guest_id_b}).`);
      if (togetherRule.vehicle_index < 0 || togetherRule.vehicle_index >= numCars) {
        issues.push("Together rule: vehicle_index out of range.");
      }
      if (togetherRule.guest_id_a === togetherRule.guest_id_b) {
        issues.push("Together rule: guest A and guest B must be different.");
      }
    }

    for (const [a, b] of incompatiblePairs) {
      if (!guestIds.includes(a) || !guestIds.includes(b))
        issues.push(`Incompat pair has unknown guest id: ${a}, ${b}`);
      if (a === b) issues.push("Incompatibility pair cannot be the same guest.");
    }

    return issues;
  }, [
    guests,
    numCars,
    capacityPerCar,
    roundTripMin,
    maxWaitMin,
    useVehicleCaps,
    computedVehicleCaps,
    togetherEnabled,
    togetherRule,
    guestIds,
    incompatiblePairs,
  ]);

  function addGuest() {
    const id = newGuestId.trim();
    const name = newGuestName.trim() || id;
    const min = hhmmToMinutes(newGuestTime);

    if (!id) {
      setError("Guest ID is required.");
      return;
    }
    if (!Number.isFinite(min)) {
      setError("Arrival time must be HH:MM.");
      return;
    }
    if (guests.some((g) => g.guest_id === id)) {
      setError(`Guest ID already exists: ${id}`);
      return;
    }

    setGuests((prev) => [
      ...prev,
      { guest_id: id, name, arrival_min: clampInt(min, 0, 10_000) },
    ]);

    setNewGuestId("");
    setNewGuestName("");
    setNewGuestTime("00:00");
    setError(null);
  }

  function removeGuest(guest_id: string) {
    setGuests((prev) => prev.filter((g) => g.guest_id !== guest_id));
  }

  function updateGuestArrival(guest_id: string, hhmm: string) {
    const min = hhmmToMinutes(hhmm);
    setGuests((prev) =>
      prev.map((g) =>
        g.guest_id === guest_id
          ? {
              ...g,
              arrival_min: Number.isFinite(min)
                ? clampInt(min, 0, 10_000)
                : g.arrival_min,
            }
          : g
      )
    );
  }

  function addIncompatPair() {
    if (!incompatA || !incompatB) return;
    if (incompatA === incompatB) {
      setError("Cannot create incompatibility pair with the same guest.");
      return;
    }
    const key = `${incompatA}__${incompatB}`;
    const exists = incompatiblePairs.some(
      ([a, b]) => `${a}__${b}` === key || `${b}__${a}` === key
    );
    if (exists) {
      setError("That incompatibility pair already exists.");
      return;
    }
    setIncompatiblePairs((prev) => [...prev, [incompatA, incompatB]]);
    setError(null);
  }

  function removeIncompatPair(idx: number) {
    setIncompatiblePairs((prev) => prev.filter((_, i) => i !== idx));
  }

  function resetAll() {
    setEndpoint(DEFAULT_ENDPOINT);
    setGuests(seedGuests);
    setNumCars(3);
    setCapacityPerCar(9);
    setRoundTripMin(240);
    setMaxWaitMin(90);
    setUseVehicleCaps(true);
    setVehicleCaps([4, 9, 9]);
    setTogetherEnabled(false);
    setTogetherRule({ guest_id_a: "G1", guest_id_b: "G2", vehicle_index: 0 });
    setIncompatEnabled(false);
    setIncompatiblePairs([]);
    setResult(null);
    setError(null);
  }

  async function solve() {
    setError(null);
    setResult(null);

    if (validation.length) {
      setError(validation[0]);
      return;
    }

    const payload: any = {
      num_cars: clampInt(numCars, 1, 99),
      capacity_per_car: clampInt(capacityPerCar, 1, 60),
      max_wait_min: clampInt(maxWaitMin, 0, 10_000),
      round_trip_min: clampInt(roundTripMin, 1, 10_000),
      guests: guests
        .map((g) => ({
          guest_id: g.guest_id,
          name: g.name,
          arrival_min: clampInt(g.arrival_min, 0, 10_000),
        }))
        .sort((a, b) => a.arrival_min - b.arrival_min),
    };

    if (useVehicleCaps) payload.vehicle_capacities = computedVehicleCaps;

    if (togetherEnabled) {
      payload.must_ride_together_in_vehicle = {
        guest_id_a: togetherRule.guest_id_a,
        guest_id_b: togetherRule.guest_id_b,
        vehicle_index: togetherRule.vehicle_index,
      };
    }

    if (incompatEnabled && incompatiblePairs.length) {
      payload.incompatible_pairs = incompatiblePairs;
    }

    setIsSolving(true);
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await resp.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        // non-json response
      }

      if (!resp.ok) {
        const msg = data?.detail ? JSON.stringify(data.detail, null, 2) : text;
        throw new Error(`HTTP ${resp.status}: ${msg}`);
      }

      setResult(data as SolveResponse);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsSolving(false);
    }
  }

  const summary = useMemo(() => {
    if (!result || result.status !== "ok") return null;
    const trips = result.trips ?? [];
    const totalWait = result.total_wait_min ?? 0;
    const numTrips = result.num_trips_used ?? trips.length;
    return { trips, totalWait, numTrips };
  }, [result]);

  return (
    <div className="min-h-screen bg-white text-zinc-950">
      {/* Top bar */}
      <div className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-zinc-950 text-white">
              <Car className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">
                Shuttle Optimizer
              </div>
              <div className="text-xs text-zinc-500">Scheduling, simplified.</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="rounded-2xl" onClick={() => setAboutOpen(true)}>
              About
            </Button>
            <Button variant="ghost" className="rounded-2xl" onClick={resetAll}>
              Reset
            </Button>
            <Button className="rounded-2xl" onClick={solve} disabled={isSolving}>
              <Wand2 className="mr-2 h-4 w-4" />
              {isSolving ? "Solving…" : "Solve"}
            </Button>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="mx-auto max-w-6xl px-4 pt-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]"
        >
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-zinc-600">
              <Clock className="h-3.5 w-3.5" />
              Constraint programming · CP-SAT
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              Scheduling, simplified.
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600">
              Define arrivals, capacities, and constraints. The solver batches
              people into trips and schedules trips on reusable vehicles while
              minimizing waiting time.
            </p>

            {error ? (
              <Alert className="mt-6 border-red-200 bg-red-50 text-red-900">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Something needs attention</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap text-xs">
                  {error}
                </AlertDescription>
              </Alert>
            ) : null}

            {result?.status === "infeasible" ? (
              <Alert className="mt-6 border-amber-200 bg-amber-50 text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Infeasible</AlertTitle>
                <AlertDescription className="text-xs">
                  {result.reason ||
                    "No schedule satisfies the current constraints. Try increasing max wait, adding vehicles, or reducing round trip time."}
                </AlertDescription>
              </Alert>
            ) : null}

            {summary ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Card className="rounded-3xl">
                  <CardHeader className="pb-2">
                    <CardDescription>Total waiting</CardDescription>
                    <CardTitle className="text-2xl">
                      {summary.totalWait} min
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="rounded-3xl">
                  <CardHeader className="pb-2">
                    <CardDescription>Trips used</CardDescription>
                    <CardTitle className="text-2xl">{summary.numTrips}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="rounded-3xl">
                  <CardHeader className="pb-2">
                    <CardDescription>Vehicles</CardDescription>
                    <CardTitle className="text-2xl">{numCars}</CardTitle>
                  </CardHeader>
                </Card>
              </div>
            ) : null}
          </div>

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base">API endpoint</CardTitle>
              <CardDescription>Connect to a running solver service</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="endpoint">Endpoint</Label>
                <Input
                  id="endpoint"
                  className="rounded-2xl"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://your-service.onrender.com/solve"
                />
              </div>
              <div className="text-xs text-zinc-500">
                Use a hosted URL for production, or a local URL while developing.
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="mt-10">
          <Tabs defaultValue="inputs" className="w-full">
            <TabsList className="rounded-2xl bg-zinc-100 p-1">
              <TabsTrigger value="inputs" className="rounded-xl">
                Inputs
              </TabsTrigger>
              <TabsTrigger value="constraints" className="rounded-xl">
                Constraints
              </TabsTrigger>
              <TabsTrigger value="results" className="rounded-xl">
                Results
              </TabsTrigger>
            </TabsList>

            {/* INPUTS */}
            <TabsContent value="inputs" className="mt-6">
              <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
                <Card className="rounded-3xl">
                  <CardHeader>
                    <CardTitle className="text-base">Vehicles and timing</CardTitle>
                    <CardDescription>Fleet and operational assumptions</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Number of vehicles</Label>
                        <Input
                          className="rounded-2xl"
                          type="number"
                          min={1}
                          value={numCars}
                          onChange={(e) =>
                            setNumCars(clampInt(Number(e.target.value), 1, 99))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Default capacity (legacy)</Label>
                        <Input
                          className="rounded-2xl"
                          type="number"
                          min={1}
                          value={capacityPerCar}
                          onChange={(e) =>
                            setCapacityPerCar(
                              clampInt(Number(e.target.value), 1, 60)
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Round trip (min)</Label>
                        <Input
                          className="rounded-2xl"
                          type="number"
                          min={1}
                          value={roundTripMin}
                          onChange={(e) =>
                            setRoundTripMin(
                              clampInt(Number(e.target.value), 1, 10_000)
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Max wait window (min)</Label>
                        <Input
                          className="rounded-2xl"
                          type="number"
                          min={0}
                          value={maxWaitMin}
                          onChange={(e) =>
                            setMaxWaitMin(
                              clampInt(Number(e.target.value), 0, 10_000)
                            )
                          }
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between rounded-2xl border p-3">
                      <div>
                        <div className="text-sm font-medium">Per-vehicle capacities</div>
                        <div className="text-xs text-zinc-500">
                          Support mixed fleets (car plus vans)
                        </div>
                      </div>
                      <Switch
                        checked={useVehicleCaps}
                        onCheckedChange={setUseVehicleCaps}
                      />
                    </div>

                    {useVehicleCaps ? (
                      <div className="space-y-3">
                        <div className="text-sm font-medium">Vehicle capacities</div>
                        <div className="space-y-2">
                          {Array.from({ length: numCars }).map((_, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-3 rounded-2xl border p-3"
                            >
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={idx === 0 ? "default" : "secondary"}
                                  className="rounded-full"
                                >
                                  Vehicle {idx}
                                </Badge>
                                <span className="text-xs text-zinc-500">
                                  {idx === 0 ? "Optional smaller vehicle" : "Shuttle"}
                                </span>
                              </div>
                              <Input
                                className="w-24 rounded-2xl"
                                type="number"
                                min={1}
                                value={computedVehicleCaps[idx] ?? capacityPerCar}
                                onChange={(e) => {
                                  const v = clampInt(Number(e.target.value), 1, 60);
                                  setVehicleCaps((prev) => {
                                    const next = [...prev];
                                    next[idx] = v;
                                    return next;
                                  });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="text-xs text-zinc-500">
                          Note: the API still expects{" "}
                          <span className="font-mono">capacity_per_car</span> for
                          backward compatibility.
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="rounded-3xl">
                  <CardHeader>
                    <CardTitle className="text-base">Arrivals</CardTitle>
                    <CardDescription>
                      Times are stored as minutes; edited as HH:MM
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_0.7fr_auto]">
                      <div className="space-y-1">
                        <Label>Guest ID</Label>
                        <Input
                          className="rounded-2xl"
                          value={newGuestId}
                          onChange={(e) => setNewGuestId(e.target.value)}
                          placeholder="e.g., G7"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Name</Label>
                        <Input
                          className="rounded-2xl"
                          value={newGuestName}
                          onChange={(e) => setNewGuestName(e.target.value)}
                          placeholder="Display name"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Arrival (HH:MM)</Label>
                        <Input
                          className="rounded-2xl"
                          value={newGuestTime}
                          onChange={(e) => setNewGuestTime(e.target.value)}
                          placeholder="07:30"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          className="rounded-2xl"
                          variant="secondary"
                          onClick={addGuest}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Add
                        </Button>
                      </div>
                    </div>

                    <Separator className="my-5" />

                    <ScrollArea className="h-[360px] rounded-2xl border">
                      <div className="divide-y">
                        {guests
                          .slice()
                          .sort((a, b) => a.arrival_min - b.arrival_min)
                          .map((g) => (
                            <div
                              key={g.guest_id}
                              className="flex items-center justify-between gap-3 p-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="truncate text-sm font-medium">
                                    {g.name}
                                  </div>
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full"
                                  >
                                    {g.guest_id}
                                  </Badge>
                                </div>
                                <div className="text-xs text-zinc-500">
                                  arrival_min: {g.arrival_min}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  className="w-24 rounded-2xl"
                                  value={minutesToHHMM(g.arrival_min)}
                                  onChange={(e) =>
                                    updateGuestArrival(g.guest_id, e.target.value)
                                  }
                                />
                                <Button
                                  variant="ghost"
                                  className="rounded-2xl"
                                  onClick={() => removeGuest(g.guest_id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </ScrollArea>

                    {validation.length ? (
                      <div className="mt-3 text-xs text-zinc-500">
                        <span className="font-medium">Checks:</span>{" "}
                        {validation[0]}
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-zinc-500">
                        All inputs look good.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* CONSTRAINTS */}
            <TabsContent value="constraints" className="mt-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="rounded-3xl">
                  <CardHeader>
                    <CardTitle className="text-base">Must ride together</CardTitle>
                    <CardDescription>
                      Enforce same trip; optionally pin to a specific vehicle
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between rounded-2xl border p-3">
                      <div>
                        <div className="text-sm font-medium">Enable together rule</div>
                        <div className="text-xs text-zinc-500">
                          Useful for pairing or special handling
                        </div>
                      </div>
                      <Switch
                        checked={togetherEnabled}
                        onCheckedChange={setTogetherEnabled}
                      />
                    </div>

                    {togetherEnabled ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Guest A</Label>
                          <Select
                            value={togetherRule.guest_id_a}
                            onValueChange={(v) =>
                              setTogetherRule((p) => ({ ...p, guest_id_a: v }))
                            }
                          >
                            <SelectTrigger className="rounded-2xl">
                              <SelectValue placeholder="Select guest" />
                            </SelectTrigger>
                            <SelectContent>
                              {guestIds.map((id) => (
                                <SelectItem key={id} value={id}>
                                  {id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label>Guest B</Label>
                          <Select
                            value={togetherRule.guest_id_b}
                            onValueChange={(v) =>
                              setTogetherRule((p) => ({ ...p, guest_id_b: v }))
                            }
                          >
                            <SelectTrigger className="rounded-2xl">
                              <SelectValue placeholder="Select guest" />
                            </SelectTrigger>
                            <SelectContent>
                              {guestIds.map((id) => (
                                <SelectItem key={id} value={id}>
                                  {id}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <Label>Pinned vehicle index</Label>
                          <Select
                            value={String(togetherRule.vehicle_index)}
                            onValueChange={(v) =>
                              setTogetherRule((p) => ({
                                ...p,
                                vehicle_index: Number(v),
                              }))
                            }
                          >
                            <SelectTrigger className="rounded-2xl">
                              <SelectValue placeholder="Vehicle" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: numCars }).map((_, idx) => (
                                <SelectItem key={idx} value={String(idx)}>
                                  Vehicle {idx}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="mt-1 text-xs text-zinc-500">
                            If you pin to a smaller vehicle, ensure its capacity
                            is set accordingly.
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="rounded-3xl">
                  <CardHeader>
                    <CardTitle className="text-base">Incompatibilities</CardTitle>
                    <CardDescription>
                      Prevent specific pairs from sharing the same trip
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between rounded-2xl border p-3">
                      <div>
                        <div className="text-sm font-medium">
                          Enable incompatibilities
                        </div>
                        <div className="text-xs text-zinc-500">
                          Adds constraints of the form x(i,m) + x(j,m) ≤ 1
                        </div>
                      </div>
                      <Switch
                        checked={incompatEnabled}
                        onCheckedChange={setIncompatEnabled}
                      />
                    </div>

                    {incompatEnabled ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                          <div className="space-y-1">
                            <Label>Guest A</Label>
                            <Select value={incompatA} onValueChange={setIncompatA}>
                              <SelectTrigger className="rounded-2xl">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {guestIds.map((id) => (
                                  <SelectItem key={id} value={id}>
                                    {id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label>Guest B</Label>
                            <Select value={incompatB} onValueChange={setIncompatB}>
                              <SelectTrigger className="rounded-2xl">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {guestIds.map((id) => (
                                  <SelectItem key={id} value={id}>
                                    {id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex items-end">
                            <Button
                              className="rounded-2xl"
                              variant="secondary"
                              onClick={addIncompatPair}
                            >
                              <Plus className="mr-2 h-4 w-4" /> Add
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {incompatiblePairs.length === 0 ? (
                            <div className="rounded-2xl border p-3 text-xs text-zinc-500">
                              No pairs added yet.
                            </div>
                          ) : (
                            incompatiblePairs.map(([a, b], idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between rounded-2xl border p-3"
                              >
                                <div className="flex items-center gap-2 text-sm">
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full"
                                  >
                                    {a}
                                  </Badge>
                                  <span className="text-zinc-400">×</span>
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full"
                                  >
                                    {b}
                                  </Badge>
                                </div>
                                <Button
                                  variant="ghost"
                                  className="rounded-2xl"
                                  onClick={() => removeIncompatPair(idx)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-zinc-500">
                        Turn this on only when needed. Constraints reduce flexibility.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* RESULTS */}
            <TabsContent value="results" className="mt-6">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-base">Plan</CardTitle>
                  <CardDescription>Trips grouped by departure time</CardDescription>
                </CardHeader>
                <CardContent>
                  {!summary ? (
                    <div className="rounded-2xl border p-8 text-center text-sm text-zinc-500">
                      Run the solver to see a trip plan.
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {summary.trips.map((t) => (
                        <div key={t.trip_index} className="rounded-3xl border p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge className="rounded-full">
                                  Trip {t.trip_index}
                                </Badge>
                                <Badge variant="secondary" className="rounded-full">
                                  Vehicle {t.vehicle_index}
                                </Badge>
                                <Badge variant="secondary" className="rounded-full">
                                  Departs {minutesToHHMM(t.departure_min)}
                                </Badge>
                              </div>
                              <div className="mt-2 text-xs text-zinc-500">
                                Arrival window: {minutesToHHMM(t.min_arrival_min)} to{" "}
                                {minutesToHHMM(t.max_arrival_min)} · Guests: {t.num_guests}
                              </div>
                            </div>
                          </div>

                          <Separator className="my-3" />

                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {t.guests.map((g) => (
                              <div key={g.guest_id} className="rounded-2xl bg-zinc-50 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium">
                                      {g.name}
                                    </div>
                                    <div className="text-xs text-zinc-500">
                                      {g.guest_id}
                                    </div>
                                  </div>
                                  <Badge
                                    variant={g.wait_min === 0 ? "secondary" : "default"}
                                    className="rounded-full"
                                  >
                                    wait {g.wait_min}m
                                  </Badge>
                                </div>
                                <div className="mt-2 text-xs text-zinc-500">
                                  arrives {minutesToHHMM(g.arrival_min)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="pb-12 pt-10 text-xs text-zinc-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>{guests.length} guests</span>
            </div>
            <div className="text-right">
              Built with CP-SAT • Designed for real-world shuttle planning
            </div>
          </div>
        </div>
      </div>

      {/* About modal */}
      {aboutOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b p-6">
                <div className="text-lg font-semibold tracking-tight">
                  Why I Built This
                </div>
              <Button
                variant="ghost"
                className="rounded-2xl"
                onClick={() => setAboutOpen(false)}
              >
                Close
              </Button>
            </div>
            <ScrollArea className="max-h-[90vh]">
            <div className="space-y-4 p-6 text-sm leading-6 text-zinc-700">
              <p>
                This project started while I was planning transportation for my sister’s wedding.
              </p>

              <p>
                At first, it sounded like a straightforward coordination task. Guests were arriving
                at different times, there were only a few vehicles, and the drive to the venue was
                not that long. But once I tried to plan it properly, it got complex fast. Flights
                landed hours apart, vehicles needed to run multiple round trips, and some guests had
                to travel together while others could not wait too long. It was also not as simple
                as relying on a hotel shuttle, since guests were spread across different hotels, so
                there was no single pickup point or shuttle schedule that worked for everyone. It
                also did not help that my Indian parents expected me to personally receive all the
                VIP guests, which sounded reasonable in theory and became a scheduling constraint in
                practice! (If only they had told me sooner…)
              </p>

              <p>
                Spreadsheets were brittle. Group chats were chaotic. Manual planning did not scale.
              </p>

              <p>
                What helped was stepping back and treating it as an optimization problem.
              </p>

              <p>
                Shuttle Optimizer is a small, explicit model of that situation. Guests are defined
                by arrival times. Vehicles have capacities and fixed round trip durations. Trips are
                decisions about who rides together and when a vehicle departs. Hard constraints must
                be respected. Capacity limits cannot be exceeded. Vehicles cannot be in two places at
                once. Optional rules like must ride together or cannot ride together are enforced
                exactly.
              </p>

              <p>
                Given those inputs, the solver searches for a feasible plan that minimizes total
                waiting time.
              </p>

              <p>
                Under the hood, this uses Google OR-Tools CP-SAT. The optimization occurs through a
                combination of constraint propagation and branch-and-bound style search. The solver
                explores different assignments of guests to trips and vehicles. As it builds partial
                solutions, it maintains bounds on the best outcome that could still be achieved. If a
                branch cannot outperform the best solution found so far, it is discarded. This
                continues until the solver can prove that no better solution exists.
              </p>

              <p>
                What matters in practice is the guarantee. When the solver returns an optimal plan,
                it is not a heuristic guess. It is the best possible plan given the constraints you
                specified.
              </p>

              <p>
                There is also something quietly philosophical about this process. Many coordination
                problems feel chaotic because their constraints are implicit. We rely on intuition,
                make local decisions, and hope the global plan holds. Optimization forces you to write
                down what you believe matters and what cannot be violated. When the solver fails, it
                usually means the assumptions themselves are inconsistent or too tight.
              </p>

              <p>
                In that sense, the model is not just solving the problem. <i>It is revealing it</i>
              </p>

              <p>
                <b>Aryan M</b>
              </p>
            </div>

            </ScrollArea>

            <div className="flex items-center justify-between border-t p-4">
              <div className="text-xs text-zinc-500">
                Built with CP-SAT • Open-source
              </div>
              <Button className="rounded-2xl" onClick={() => setAboutOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
