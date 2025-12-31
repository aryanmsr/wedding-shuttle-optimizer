# Wedding Shuttle Optimizer

[Link](https://wedding-shuttle-optimizer-ui.onrender.com/).

An optimization engine for planning airport-to-hotel wedding shuttles under real-world constraints such as arrival waves, vehicle reuse, turnaround times, seat capacities, and guest-specific ride rules.

The system is implemented as a backend service using **Google OR-Tools (CP-SAT)** and models the problem as a **constraint optimization problem**.

---

## Problem Overview

Guests arrive at an airport at different times and require transportation to a hotel. A limited number of vehicles are available, and each vehicle can perform **multiple shuttle trips** (airport → hotel → airport), subject to a fixed **round-trip time**.

Each shuttle trip:
- Serves a group of guests
- Has a vehicle-dependent seating capacity
- Departs as soon as the last assigned guest arrives
- Requires all assigned guests to arrive within a bounded time window

Some guests may have **hard constraints**, such as:
- Must ride together
- Must ride in a specific vehicle
- Cannot ride together

The goal is to assign guests to trips and trips to vehicles in a way that minimizes total guest waiting time.

---

## Mathematical Model

### Sets

- Guests: $i \in \{1, \dots, N\}$
- Trips (upper bounded): $m \in \{1, \dots, M\}$
- Vehicles: $k \in \{1, \dots, K\}$

---

### Parameters

- Guest arrival time: $a_i$
- Maximum arrival spread within a trip: $W$
- Vehicle round-trip duration: $RT$
- Seating capacity of vehicle $k$: $cap_k$

---

### Decision Variables

- Guest-to-trip assignment: $x_{i,m} \in \{0,1\}$
- Trip usage indicator: $used_m \in \{0,1\}$
- Trip-to-vehicle assignment: $z_{m,k} \in \{0,1\}$
- Trip departure time: $dep_m \in \mathbb{Z}$

To avoid brittle max/min-with-conditions notation in Markdown math renderers, we also define:

- Earliest arrival time in trip $m$: $A_m^{\min} \in \mathbb{Z}$
- Latest arrival time in trip $m$: $A_m^{\max} \in \mathbb{Z}$

---

### Constraints

#### 1. Each guest is assigned to exactly one trip

$$
\sum_{m=1}^{M} x_{i,m} = 1 \quad \forall i
$$

---

#### 2. Each used trip is assigned to exactly one vehicle

$$
\sum_{k=1}^{K} z_{m,k} = used_m \quad \forall m
$$

---

#### 3. Vehicle-dependent capacity

$$
\sum_{i=1}^{N} x_{i,m}
\le
\sum_{k=1}^{K} cap_k \cdot z_{m,k}
\quad \forall m
$$

---

#### 4. Trip arrival window (maximum wait)

$$
A_m^{\max} - A_m^{\min} \le W
\quad \forall m \text{ such that } used_m = 1
$$

---

#### 5. Departure time definition

Each trip departs when the last assigned guest arrives:

$$
dep_m = A_m^{\max} \quad \forall m
$$

---

#### 6. Vehicle reuse (no overlap)

If a vehicle serves multiple trips, the corresponding trip intervals must not overlap:

$$
[dep_m, dep_m + RT) \cap [dep_{m'}, dep_{m'} + RT) = \emptyset
$$

for all $m \ne m'$ and vehicle $k$ whenever $z_{m,k} = 1$ and $z_{m',k} = 1$.

This constraint is enforced using **optional interval variables** and a `NoOverlap` constraint in CP-SAT.

---

#### 7. Guest-specific constraints (optional)

**Incompatibility** (guests $i$ and $j$ cannot ride together):

$$
x_{i,m} + x_{j,m} \le 1 \quad \forall m
$$

**Must ride together**:

$$
x_{i,m} = x_{j,m} \quad \forall m
$$

**Must use a specific vehicle**:

$$
x_{i,m} = 1 \Rightarrow z_{m,k} = 1
$$

---

### Objective Function

Minimize total guest waiting time:

$$
\min \sum_{i=1}^{N} \left( dep_{\text{trip}(i)} - a_i \right)
$$

A small secondary penalty on the number of trips used can be added to discourage unnecessary fragmentation.

---

## Implementation Notes

- Implemented using **Google OR-Tools CP-SAT**
- Arrival min/max per trip computed via masked variables
- Vehicle reuse modeled using optional interval variables (`NoOverlap`)
- Supports:
  - Heterogeneous vehicle capacities
  - Multiple trips per vehicle
  - Hard guest-level constraints (ride-together, incompatibilities, fixed-vehicle rules)

---

## Example Use Cases

- Destination wedding airport logistics
- Event transportation planning
- Shuttle scheduling with time windows
- Small-scale fleet reuse problems

---

## Tech Stack

- Python
- FastAPI
- Google OR-Tools (CP-SAT)
- Pydantic

---

## License

MIT
