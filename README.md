# Wedding Shuttle Optimizer

An optimization engine for planning airport-to-hotel wedding shuttles under real-world constraints such as arrival waves, vehicle reuse, turnaround times, seat capacities, and guest-specific ride rules.

The system is built as a backend service using **Google OR-Tools (CP-SAT)** and models the problem as a **constraint optimization problem**.

---

## Problem Overview

Guests arrive at an airport at different times and need transportation to a hotel. A limited number of vehicles are available, and each vehicle can perform **multiple shuttle trips** (airport → hotel → airport), subject to a fixed **round-trip time**.

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

Guests:
$$
i \in \{1, \dots, N\}
$$

Trips (upper bounded):
$$
m \in \{1, \dots, M\}
$$

Vehicles:
$$
k \in \{1, \dots, K\}
$$

---

### Parameters

Guest arrival time:
$$
a_i
$$

Maximum arrival spread within a trip:
$$
W
$$

Vehicle round-trip duration:
$$
RT
$$

Vehicle seating capacity:
$$
cap_k
$$

---

### Decision Variables

Guest-to-trip assignment:
$$
x_{i,m} \in \{0,1\}
$$

Trip usage indicator:
$$
used_m \in \{0,1\}
$$

Trip-to-vehicle assignment:
$$
z_{m,k} \in \{0,1\}
$$

Trip departure time:
$$
dep_m \in \mathbb{Z}
$$

To avoid brittle max/min-with-conditions notation in Markdown math renderers, we also define:

Earliest arrival time in trip \(m\):
$$
A_m^{\min} \in \mathbb{Z}
$$

Latest arrival time in trip \(m\):
$$
A_m^{\max} \in \mathbb{Z}
$$
