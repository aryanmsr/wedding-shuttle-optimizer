from __future__ import annotations

from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple

from ortools.sat.python import cp_model


@dataclass(frozen=True)
class Guest:
    guest_id: str
    name: str
    arrival_min: int  # minutes from reference (e.g., Feb 4 00:00)


@dataclass(frozen=True)
class SolveParams:
    num_cars: int
    capacity_per_car: int
    max_wait_min: int
    time_horizon_min: Optional[int] = None
    round_trip_min: int = 240
    vehicle_capacities: Optional[List[int]] = None
    incompatible_pairs: Optional[List[Tuple[str, str]]] = None
    must_ride_together_in_vehicle: Optional[Dict[str, Any]] = None


from typing import List, Dict, Any, Optional
from ortools.sat.python import cp_model

def solve_pickups_multitrip(guests, params) -> Dict[str, Any]:
    if not guests:
        return {
            "status": "ok",
            "num_guests": 0,
            "num_vehicles": params.num_cars,
            "total_wait_min": 0,
            "num_trips_used": 0,
            "trips": [],
        }

    K = params.num_cars
    W = params.max_wait_min
    RT = getattr(params, "round_trip_min", 240)
    # Determine final per-vehicle capacities (robust to missing/empty/mismatched input)
    raw_caps = getattr(params, "vehicle_capacities", None)

    if raw_caps is None:
        vehicle_caps = [params.capacity_per_car] * K
    else:
        vehicle_caps = list(raw_caps)

    # Normalize length to exactly K (avoid silent mis-parses)
    if len(vehicle_caps) < K:
        vehicle_caps = vehicle_caps + [params.capacity_per_car] * (K - len(vehicle_caps))
    elif len(vehicle_caps) > K:
        vehicle_caps = vehicle_caps[:K]

    # Validate and clamp
    vehicle_caps = [int(c) for c in vehicle_caps]
    if any(c < 1 for c in vehicle_caps):
        raise ValueError("vehicle_capacities must be >= 1")

    CAP_MAX = max(vehicle_caps)

    incompatible_pairs: List[Tuple[str, str]] = getattr(params, "incompatible_pairs", []) or []

    together_rule = getattr(params, "must_ride_together_in_vehicle", None)

    arrivals = [g.arrival_min for g in guests]
    min_a = min(arrivals)
    max_a = max(arrivals)

    horizon = getattr(params, "time_horizon_min", None)
    if horizon is None:
        horizon = max_a + W + RT

    n = len(guests)
    M = n  

    id_to_i = {g.guest_id: i for i, g in enumerate(guests)}

    model = cp_model.CpModel()

    # x[i][m] = 1 if guest i assigned to trip m
    x = [[model.NewBoolVar(f"x_{i}_{m}") for m in range(M)] for i in range(n)]

    # used[m] = 1 if trip m has >= 1 guest
    used = [model.NewBoolVar(f"used_{m}") for m in range(M)]

    # dep[m] departure time of trip m from airport
    dep = [model.NewIntVar(min_a, horizon, f"dep_{m}") for m in range(M)]

    BIG_POS = horizon + 10_000
    BIG_NEG = -10_000

    min_arr = [model.NewIntVar(min_a, BIG_POS, f"min_arr_{m}") for m in range(M)]
    max_arr = [model.NewIntVar(BIG_NEG, max_a, f"max_arr_{m}") for m in range(M)]

    # z[m][k] = 1 if trip m is served by vehicle k
    z = [[model.NewBoolVar(f"z_{m}_{k}") for k in range(K)] for m in range(M)]

    # 1) Each guest must be assigned to exactly one trip
    for i in range(n):
        model.Add(sum(x[i][m] for m in range(M)) == 1)

    # 2) Trip constraints
    for m in range(M):
        trip_load = sum(x[i][m] for i in range(n))

        # Link: if any guest assigned => used[m] = 1
        for i in range(n):
            model.AddImplication(x[i][m], used[m])

        model.Add(trip_load >= 1).OnlyEnforceIf(used[m])
        model.Add(trip_load == 0).OnlyEnforceIf(used[m].Not())

        # Each used trip assigned to exactly one vehicle; unused to none
        model.Add(sum(z[m][k] for k in range(K)) == used[m])

        # NEW: capacity depends on chosen vehicle
        # Since exactly one z[m][k] = 1 when used, RHS becomes capacity of that vehicle.
        model.Add(trip_load <= sum(vehicle_caps[k] * z[m][k] for k in range(K)))
        masked_for_min = []
        masked_for_max = []
        for i in range(n):
            a_i = guests[i].arrival_min
            vmin = model.NewIntVar(min_a, BIG_POS, f"vmin_{i}_{m}")
            vmax = model.NewIntVar(BIG_NEG, max_a, f"vmax_{i}_{m}")

            model.Add(vmin == a_i).OnlyEnforceIf(x[i][m])
            model.Add(vmin == BIG_POS).OnlyEnforceIf(x[i][m].Not())

            model.Add(vmax == a_i).OnlyEnforceIf(x[i][m])
            model.Add(vmax == BIG_NEG).OnlyEnforceIf(x[i][m].Not())

            masked_for_min.append(vmin)
            masked_for_max.append(vmax)

        # Fix unused trips to avoid infeasibility
        dummy_min = model.NewIntVar(min_a, BIG_POS, f"dummy_min_{m}")
        dummy_max = model.NewIntVar(BIG_NEG, max_a, f"dummy_max_{m}")

        model.Add(dummy_min == min_a).OnlyEnforceIf(used[m].Not())
        model.Add(dummy_min == BIG_POS).OnlyEnforceIf(used[m])

        model.Add(dummy_max == min_a).OnlyEnforceIf(used[m].Not())
        model.Add(dummy_max == BIG_NEG).OnlyEnforceIf(used[m])

        masked_for_min.append(dummy_min)
        masked_for_max.append(dummy_max)

        model.AddMinEquality(min_arr[m], masked_for_min)
        model.AddMaxEquality(max_arr[m], masked_for_max)

        # Leave when last assigned guest arrives
        model.Add(dep[m] == max_arr[m])

        # If used, arrival spread <= W
        model.Add(max_arr[m] - min_arr[m] <= W).OnlyEnforceIf(used[m])

    # 3) Incompatibility constraints (can’t be in same trip)
    for (gid1, gid2) in incompatible_pairs:
        if gid1 not in id_to_i or gid2 not in id_to_i:
            continue
        i1, i2 = id_to_i[gid1], id_to_i[gid2]
        for m in range(M):
            model.Add(x[i1][m] + x[i2][m] <= 1)

    # 4) Some guests must ride together in specific vehicle
    if together_rule is not None:
        gid_a = together_rule["guest_id_a"]
        gid_b = together_rule["guest_id_b"]
        k0 = together_rule["vehicle_index"]

        if gid_a not in id_to_i or gid_b not in id_to_i:
            raise ValueError("must_ride_together_in_vehicle guest ids not found")

        ia, ib = id_to_i[gid_a], id_to_i[gid_b]
        if not (0 <= k0 < K):
            raise ValueError("vehicle_index out of range")

        for m in range(M):
            # Same trip
            model.Add(x[ia][m] == x[ib][m])
            model.AddImplication(x[ia][m], z[m][k0])

    # 5) Vehicle scheduling: NoOverlap with RT
    for k in range(K):
        intervals_k = []
        for m in range(M):
            end_mk = model.NewIntVar(min_a, horizon + RT, f"end_{m}_{k}")
            model.Add(end_mk == dep[m] + RT)

            interval_mk = model.NewOptionalIntervalVar(
                dep[m], RT, end_mk, z[m][k], f"interval_{m}_{k}"
            )
            intervals_k.append(interval_mk)

        model.AddNoOverlap(intervals_k)

    # 6) Objective: minimize total waiting (+ small penalty for number of trips)
    waits = []
    for i in range(n):
        dep_i = model.NewIntVar(min_a, horizon, f"dep_guest_{i}")
        for m in range(M):
            model.Add(dep_i == dep[m]).OnlyEnforceIf(x[i][m])

        wait_i = model.NewIntVar(0, horizon - min_a, f"wait_{i}")
        model.Add(wait_i == dep_i - guests[i].arrival_min)
        waits.append(wait_i)

    total_wait = model.NewIntVar(0, 10_000_000, "total_wait")
    model.Add(total_wait == sum(waits))

    trip_penalty = 1
    model.Minimize(total_wait + trip_penalty * sum(used[m] for m in range(M)))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 15.0
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "status": "infeasible",
            "reason": "No schedule satisfies constraints (max_wait too small, too few vehicles, RT too large, or constraints too strict).",
        }

    # Build plan output
    trips_out = []
    for m in range(M):
        if solver.Value(used[m]) == 0:
            continue

        vehicle = None
        for k in range(K):
            if solver.Value(z[m][k]) == 1:
                vehicle = k
                break

        assigned = []
        for i, g in enumerate(guests):
            if solver.Value(x[i][m]) == 1:
                assigned.append({
                    "guest_id": g.guest_id,
                    "name": g.name,
                    "arrival_min": g.arrival_min,
                    "wait_min": solver.Value(waits[i]),
                })

        trips_out.append({
            "trip_index": m,
            "vehicle_index": vehicle,
            "vehicle_capacity": vehicle_caps[vehicle] if vehicle is not None else None,
            "departure_min": solver.Value(dep[m]),
            "min_arrival_min": solver.Value(min_arr[m]),
            "max_arrival_min": solver.Value(max_arr[m]),
            "num_guests": len(assigned),
            "guests": sorted(assigned, key=lambda r: r["arrival_min"]),
        })

    trips_out.sort(key=lambda t: t["departure_min"])

    return {
        "status": "ok",
        "num_guests": n,
        "num_vehicles": K,
        "vehicle_capacities": vehicle_caps,
        "max_wait_min": W,
        "round_trip_min": RT,
        "num_trips_used": len(trips_out),
        "total_wait_min": solver.Value(total_wait),
        "trips": trips_out,
    }