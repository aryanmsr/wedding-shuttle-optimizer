# Wedding Shuttle Optimizer

An optimization engine for planning airport-to-hotel wedding shuttles under real-world constraints such as arrival waves, vehicle reuse, turnaround times, seat capacities, and guest-specific ride rules.

The system is built as a backend service using Google OR-Tools (CP-SAT) and models the problem as a constraint optimization problem.

---

## Problem Overview

Guests arrive at an airport at different times and need transportation to a hotel. A limited number of vehicles are available, and each vehicle can perform **multiple shuttle trips** (airport → hotel → airport), subject to a fixed **round-trip time**.

Each shuttle trip:
- Serves a group of guests
- Has a maximum seating capacity
- Departs as soon as the last assigned guest arrives
- Requires all assigned guests to arrive within a bounded time window

Some guests may have **hard constraints**, such as:
- Must ride together
- Must ride in a specific vehicle
- Cannot ride together

The goal is to assign guests to trips and trips to vehicles in a way that minimizes total guest waiting time.

---

## Mathematical Model (High Level)

### Sets
- Guests: \( i \in \{1, \dots, N\} \)
- Trips: \( m \in \{1, \dots, M\} \) (upper bounded, e.g. \(M = N\))
- Vehicles: \( k \in \{1, \dots, K\} \)

---

### Parameters
- \( a_i \): arrival time of guest \(i\)
- \( W \): maximum allowable arrival spread within a trip
- \( RT \): round-trip duration for a vehicle
- \( cap_k \): seating capacity of vehicle \(k\)

---

### Decision Variables

- **Guest-to-trip assignment**
  \[
  x_{i,m} \in \{0,1\}
  \quad\text{(1 if guest \(i\) is assigned to trip \(m\))}
  \]

- **Trip usage**
  \[
  used_m \in \{0,1\}
  \quad\text{(1 if trip \(m\) serves at least one guest)}
  \]

- **Trip-to-vehicle assignment**
  \[
  z_{m,k} \in \{0,1\}
  \quad\text{(1 if trip \(m\) is served by vehicle \(k\))}
  \]

- **Trip departure time**
  \[
  dep_m \in \mathbb{Z}
  \]

---

### Constraints

#### 1. Each guest is assigned to exactly one trip
\[
\sum_m x_{i,m} = 1 \quad \forall i
\]

#### 2. Vehicle assignment
Each used trip is served by exactly one vehicle:
\[
\sum_k z_{m,k} = used_m \quad \forall m
\]

#### 3. Vehicle-dependent capacity
\[
\sum_i x_{i,m} \le \sum_k cap_k \cdot z_{m,k} \quad \forall m
\]

#### 4. Trip time window (max wait constraint)
For each used trip:
\[
\max_{i:x_{i,m}=1} a_i - \min_{i:x_{i,m}=1} a_i \le W
\]

#### 5. Departure time definition
Each trip departs as soon as the last assigned guest arrives:
\[
dep_m = \max_{i:x_{i,m}=1} a_i
\]

#### 6. Vehicle reuse / no overlap
If vehicle \(k\) serves multiple trips, their active intervals must not overlap:
\[
[dep_m, dep_m + RT) \cap [dep_{m'}, dep_{m'} + RT) = \emptyset
\quad \forall m \ne m', \text{ if } z_{m,k} = z_{m',k} = 1
\]

This is enforced using **optional interval variables** and `NoOverlap` constraints in CP-SAT.

#### 7. Guest-specific constraints (optional)
Examples:
- Incompatibility:  
  \[
  x_{i,m} + x_{j,m} \le 1 \quad \forall m
  \]
- Must-ride-together:
  \[
  x_{i,m} = x_{j,m} \quad \forall m
  \]
- Must use a specific vehicle:
  \[
  x_{i,m} = 1 \Rightarrow z_{m,k} = 1
  \]

---

### Objective Function

Minimize total guest waiting time:
\[
\min \sum_i (dep_{\text{trip}(i)} - a_i)
\]

A small secondary penalty on the number of trips used can be added to discourage unnecessary fragmentation.

---

## Implementation Notes

- The model is implemented using **Google OR-Tools CP-SAT**
- Min/max arrival constraints are implemented via masked variables
- Vehicle reuse is modeled with optional intervals and `NoOverlap`
- The system supports:
  - Heterogeneous vehicle capacities
  - Multiple trips per vehicle
  - Hard guest-level constraints

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
