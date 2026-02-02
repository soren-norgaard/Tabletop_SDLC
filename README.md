# Restaurant Reservation Management System

A TypeScript-based restaurant reservation management system that handles reservations, walk-ins, and ensures reliable concurrent operations.

## Project Tasks Implemented

This project implements 8 tasks from the SDLC project board:

### Task #1: Reservation Management
**Description:** Manage reservations including capturing details, preventing double bookings, and calculating availability.

**Implementation:**
- `src/services/reservationService.ts` - Core reservation CRUD operations
- `src/services/availabilityService.ts` - Availability calculation
- `src/data/store.ts` - Data persistence layer

**Acceptance Criteria Met:**
- ✅ Capture reservation details (customer name, party size, time)
- ✅ Prevent double bookings through availability checking
- ✅ Calculate table availability for any time slot

---

### Task #2: Walk-in Support
**Description:** Support walk-in guests by checking availability and assigning tables and waiters.

**Implementation:**
- `src/services/walkInService.ts` - Walk-in handling logic

**Acceptance Criteria Met:**
- ✅ Check real-time availability for walk-ins
- ✅ Assign appropriate tables based on party size
- ✅ Assign waiters to walk-in parties
- ✅ Maximize restaurant capacity usage

---

### Task #3: System Reliability and Usability
**Description:** Ensure system reliability through race condition prevention, error handling, and deterministic behavior.

**Implementation:**
- `src/utils/locking.ts` - Concurrency control
- Consistent error handling across all services

**Acceptance Criteria Met:**
- ✅ Race condition prevention via locking mechanism
- ✅ Proper error handling with clear error codes
- ✅ Deterministic behavior in all operations

---

### Task #4: Time and Data Management
**Description:** Handle time safely across timezones and ensure data persistence.

**Implementation:**
- `src/utils/timezone.ts` - Timezone-safe operations
- `src/data/store.ts` - In-memory data persistence

**Acceptance Criteria Met:**
- ✅ Timezone-safe time handling
- ✅ Reliable data storage and retrieval
- ✅ Data integrity maintained across operations

---

### Task #5: Create Reservation
**Description:** As a restaurant staff, I want to create a reservation by entering customer details, so that I can ensure the customer has a table at the desired time.

**Implementation:**
- `src/services/reservationService.ts` - `createReservation()` function

**Acceptance Criteria:**
> Given a customer requests a reservation  
> When I enter their name, party size, and desired start time  
> Then the system checks availability and confirms the reservation if possible

**Verification:**
```typescript
const result = await createReservation({
  customerName: 'John Doe',
  partySize: 4,
  startTime: '2025-06-15T19:00:00.000Z',
  timezone: 'America/New_York'
});
// result.success === true
// result.data.status === 'CONFIRMED'
```

---

### Task #6: Handle Walk-ins
**Description:** As a restaurant staff, I want to accommodate walk-in guests, so that we can maximize table usage.

**Implementation:**
- `src/services/walkInService.ts` - `handleWalkIn()` function

**Acceptance Criteria:**
> Given a walk-in guest arrives  
> When I initiate a walk-in  
> Then the system checks current availability and confirms the walk-in if possible

**Verification:**
```typescript
const result = await handleWalkIn({
  customerName: 'Walk-In Guest',
  partySize: 2
});
// result.success === true
// result.data.reservation.status === 'SEATED'
// result.data.table is assigned
```

---

### Task #7: Prevent Race Conditions
**Description:** As a system developer, I want to ensure the system handles concurrent reservation requests safely, so that we prevent double bookings and maintain system integrity.

**Implementation:**
- `src/utils/locking.ts` - Lock acquisition and release
- `src/services/reservationService.ts` - Optimistic locking via version field

**Acceptance Criteria:**
> Given multiple reservation requests occur simultaneously  
> When the system processes these requests  
> Then no race conditions occur and reservations are handled correctly

**Mechanisms:**
1. **Pessimistic Locking:** `acquireLock()`, `withLock()` for critical sections
2. **Optimistic Locking:** Version field on reservations for concurrent updates
3. **Atomic Multi-Lock:** `acquireMultipleLocks()` with rollback on failure

---

### Task #8: Timezone-Safe Scheduling
**Description:** As a system developer, I want to implement timezone-safe time handling, so that reservations are accurately scheduled regardless of timezone.

**Implementation:**
- `src/utils/timezone.ts` - Complete timezone handling utilities

**Acceptance Criteria:**
> Given a reservation is created  
> When the system processes the reservation time  
> Then the time is handled correctly across different timezones

**Features:**
- All times stored in UTC internally
- IANA timezone validation
- Timezone-aware display formatting
- Overlap detection across timezone boundaries

---

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Run Tests

```bash
npm test
```

## Usage Examples

### Create a Reservation

```typescript
import { createReservation } from './src/services';

const result = await createReservation({
  customerName: 'Jane Smith',
  customerPhone: '555-1234',
  partySize: 4,
  startTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
  timezone: 'America/New_York',
  durationMinutes: 90
});

if (result.success) {
  console.log('Reservation confirmed:', result.data);
} else {
  console.error('Error:', result.error.message);
}
```

### Handle Walk-In

```typescript
import { handleWalkIn } from './src/services';

const result = await handleWalkIn({
  customerName: 'Walk-In Party',
  partySize: 2,
  notes: 'Birthday celebration'
});

if (result.success) {
  console.log('Seated at table:', result.data.table.number);
  console.log('Waiter assigned:', result.data.waiter?.name);
}
```

### Check Availability

```typescript
import { checkAvailability } from './src/services';

const result = checkAvailability({
  startTime: '2025-06-15T19:00:00.000Z',
  partySize: 6,
  timezone: 'America/New_York'
});

if (result.success && result.data.length > 0) {
  console.log('Available tables:', result.data);
}
```

## Project Structure

```
src/
├── types/
│   └── index.ts          # Type definitions
├── utils/
│   ├── timezone.ts       # Timezone utilities (Task #4, #8)
│   ├── locking.ts        # Concurrency control (Task #3, #7)
│   └── index.ts
├── data/
│   ├── store.ts          # Data persistence (Task #4)
│   └── index.ts
├── services/
│   ├── reservationService.ts    # Reservations (Task #1, #5)
│   ├── walkInService.ts         # Walk-ins (Task #2, #6)
│   ├── availabilityService.ts   # Availability (Task #1)
│   ├── *.test.ts                # Unit tests
│   └── index.ts
└── index.ts              # Main entry point
```

## Test Coverage

The test suite covers all acceptance criteria:

- **Reservation Service Tests:** Create, read, update, cancel reservations
- **Walk-In Service Tests:** Handle walk-ins, check availability, assign resources
- **Timezone Tests:** Validation, conversion, overlap detection
- **Locking Tests:** Acquire, release, concurrent access, cleanup

## Error Handling

All services return a consistent `Result<T>` type:

```typescript
interface Result<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

## License

MIT
