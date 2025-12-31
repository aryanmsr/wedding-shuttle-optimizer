from __future__ import annotations

from typing import List, Optional, Tuple, Dict, Any
from fastapi import FastAPI
from pydantic import BaseModel, Field

from solver import Guest, SolveParams, solve_pickups_multitrip

app = FastAPI(title="Wedding Pickup Optimizer", version="0.1.0")


class GuestIn(BaseModel):
    guest_id: str = Field(..., examples=["g1"])
    name: str = Field(..., examples=["Grandma"])
    arrival_min: int = Field(..., description="Minutes from reference time (e.g., Feb 4 00:00).")



class SolveRequest(BaseModel):
    guests: List[GuestIn]
    num_cars: int
    capacity_per_car: int
    max_wait_min: int
    round_trip_min: Optional[int] = 240
    vehicle_capacities: Optional[List[int]] = None
    incompatible_pairs: Optional[List[Tuple[str, str]]] = None
    must_ride_together_in_vehicle: Optional[Dict[str, Any]] = None

    time_horizon_min: Optional[int] = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/solve")
def solve(req: SolveRequest):
    guests = [Guest(g.guest_id, g.name, g.arrival_min) for g in req.guests]
    params = SolveParams(
        num_cars=req.num_cars,
        capacity_per_car=req.capacity_per_car,
        max_wait_min=req.max_wait_min,
        time_horizon_min=req.time_horizon_min,
        round_trip_min=req.round_trip_min or 240,
        vehicle_capacities=req.vehicle_capacities,
        incompatible_pairs=req.incompatible_pairs,
        must_ride_together_in_vehicle=req.must_ride_together_in_vehicle,
    )
    return solve_pickups_multitrip(guests, params)