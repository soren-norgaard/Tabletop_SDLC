/**
 * Reservation Service
 * Task #1: Reservation Management
 * Task #5: Create Reservation
 * Task #7: Prevent Race Conditions
 * Task #8: Timezone-Safe Scheduling
 * 
 * Core functionality:
 * - Create reservations with customer details
 * - Check availability and prevent double bookings
 * - Calculate availability for given time slots
 * - Handle concurrent reservation requests safely
 */

import { v4 as uuidv4 } from 'uuid';
import {
  UUID,
  Reservation,
  ReservationStatus,
  TableStatus,
  CreateReservationRequest,
  AvailabilityRequest,
  AvailabilitySlot,
  Result,
  Table
} from '../types';
import { 
  reservationStore, 
  tableStore, 
  customerStore, 
  waiterStore 
} from '../data/store';
import { 
  nowUTC, 
  calculateEndTime, 
  doTimeRangesOverlap, 
  isFutureDateTime,
  isValidTimezone,
  DEFAULT_TIMEZONE,
  DEFAULT_DURATION_MINUTES,
  parseDateTime
} from '../utils/timezone';
import { acquireLock, releaseLock, withLock } from '../utils/locking';

/** Validation error codes */
export enum ReservationErrorCode {
  INVALID_PARTY_SIZE = 'INVALID_PARTY_SIZE',
  INVALID_TIME = 'INVALID_TIME',
  PAST_TIME = 'PAST_TIME',
  NO_AVAILABILITY = 'NO_AVAILABILITY',
  TABLE_NOT_FOUND = 'TABLE_NOT_FOUND',
  TABLE_UNAVAILABLE = 'TABLE_UNAVAILABLE',
  RESERVATION_NOT_FOUND = 'RESERVATION_NOT_FOUND',
  CONCURRENT_MODIFICATION = 'CONCURRENT_MODIFICATION',
  INVALID_TIMEZONE = 'INVALID_TIMEZONE',
  INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION'
}

/**
 * Validates a create reservation request
 */
function validateCreateRequest(request: CreateReservationRequest): Result<void> {
  // Validate party size
  if (!request.partySize || request.partySize < 1) {
    return {
      success: false,
      error: {
        code: ReservationErrorCode.INVALID_PARTY_SIZE,
        message: 'Party size must be at least 1'
      }
    };
  }

  if (request.partySize > 20) {
    return {
      success: false,
      error: {
        code: ReservationErrorCode.INVALID_PARTY_SIZE,
        message: 'Party size cannot exceed 20'
      }
    };
  }

  // Validate customer name
  if (!request.customerName || request.customerName.trim().length === 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_CUSTOMER_NAME',
        message: 'Customer name is required'
      }
    };
  }

  // Validate start time
  if (!request.startTime) {
    return {
      success: false,
      error: {
        code: ReservationErrorCode.INVALID_TIME,
        message: 'Start time is required'
      }
    };
  }

  try {
    parseDateTime(request.startTime);
  } catch {
    return {
      success: false,
      error: {
        code: ReservationErrorCode.INVALID_TIME,
        message: 'Invalid start time format. Use ISO 8601 format.'
      }
    };
  }

  // Validate timezone if provided
  if (request.timezone && !isValidTimezone(request.timezone)) {
    return {
      success: false,
      error: {
        code: ReservationErrorCode.INVALID_TIMEZONE,
        message: `Invalid timezone: ${request.timezone}`
      }
    };
  }

  // Validate future time
  if (!isFutureDateTime(request.startTime)) {
    return {
      success: false,
      error: {
        code: ReservationErrorCode.PAST_TIME,
        message: 'Reservation time must be in the future'
      }
    };
  }

  return { success: true };
}

/**
 * Finds available tables for a given time slot and party size
 */
export function findAvailableTables(
  startTime: string,
  endTime: string,
  partySize: number,
  excludeReservationId?: UUID
): Table[] {
  // Get all tables that can accommodate the party size
  const suitableTables = tableStore.findByCapacity(partySize);
  
  // Filter out tables that are out of service
  const activeTables = suitableTables.filter(
    t => t.status !== TableStatus.OUT_OF_SERVICE
  );

  // Get all reservations that overlap with the requested time
  const overlappingReservations = reservationStore
    .findByTimeRange(new Date(startTime), new Date(endTime))
    .filter(r => 
      r.status !== ReservationStatus.CANCELLED &&
      r.status !== ReservationStatus.COMPLETED &&
      r.status !== ReservationStatus.NO_SHOW &&
      r.id !== excludeReservationId
    );

  // Filter tables that don't have overlapping reservations
  const availableTables = activeTables.filter(table => {
    const tableReservations = overlappingReservations.filter(
      r => r.tableId === table.id
    );
    return tableReservations.length === 0;
  });

  // Sort by capacity (smallest first for optimal usage)
  return availableTables.sort((a, b) => a.capacity - b.capacity);
}

/**
 * Checks availability for a given request
 */
export function checkAvailability(request: AvailabilityRequest): Result<AvailabilitySlot[]> {
  const timezone = request.timezone || DEFAULT_TIMEZONE;
  
  if (!isValidTimezone(timezone)) {
    return {
      success: false,
      error: {
        code: ReservationErrorCode.INVALID_TIMEZONE,
        message: `Invalid timezone: ${timezone}`
      }
    };
  }

  const duration = request.durationMinutes || DEFAULT_DURATION_MINUTES;
  const endTime = calculateEndTime(request.startTime, duration);

  const availableTables = findAvailableTables(
    request.startTime,
    endTime,
    request.partySize
  );

  const slots: AvailabilitySlot[] = availableTables.map(table => ({
    tableId: table.id,
    tableNumber: table.number,
    tableCapacity: table.capacity,
    startTime: request.startTime,
    endTime,
    isAvailable: true
  }));

  return { success: true, data: slots };
}

/**
 * Creates a new reservation
 * Task #5: Create Reservation acceptance criteria:
 * - Given a customer requests a reservation
 * - When I enter their name, party size, and desired start time
 * - Then the system checks availability and confirms the reservation if possible
 */
export async function createReservation(
  request: CreateReservationRequest
): Promise<Result<Reservation>> {
  // Validate request
  const validation = validateCreateRequest(request);
  if (!validation.success) {
    return validation as Result<Reservation>;
  }

  const timezone = request.timezone || DEFAULT_TIMEZONE;
  const duration = request.durationMinutes || DEFAULT_DURATION_MINUTES;
  const endTime = calculateEndTime(request.startTime, duration);

  // Use locking to prevent race conditions
  const lockId = `timeslot:${request.startTime}`;
  
  return await withLock('timeslot', lockId, async () => {
    // Find available tables
    let selectedTable: Table | undefined;

    if (request.preferredTableId) {
      // Check if preferred table is available
      const preferred = tableStore.getById(request.preferredTableId);
      if (!preferred) {
        throw new Error(ReservationErrorCode.TABLE_NOT_FOUND);
      }
      
      const availableTables = findAvailableTables(
        request.startTime,
        endTime,
        request.partySize
      );
      
      if (availableTables.find(t => t.id === request.preferredTableId)) {
        selectedTable = preferred;
      }
    }

    if (!selectedTable) {
      const availableTables = findAvailableTables(
        request.startTime,
        endTime,
        request.partySize
      );

      if (availableTables.length === 0) {
        throw new Error(ReservationErrorCode.NO_AVAILABILITY);
      }

      selectedTable = availableTables[0];
    }

    // Create or find customer
    let customer = customerStore.findByPhone(request.customerPhone || '') ||
                   customerStore.findByEmail(request.customerEmail || '');

    if (!customer) {
      customer = customerStore.create({
        name: request.customerName,
        phone: request.customerPhone,
        email: request.customerEmail
      });
    }

    // Assign waiter (optional)
    const waiter = waiterStore.findWithLeastTables();
    if (waiter && selectedTable) {
      waiterStore.assignTable(waiter.id, selectedTable.id);
    }

    // Create reservation
    const reservation = reservationStore.create({
      customerId: customer.id,
      customerName: request.customerName,
      partySize: request.partySize,
      tableId: selectedTable.id,
      waiterId: waiter?.id,
      startTime: request.startTime,
      endTime,
      status: ReservationStatus.CONFIRMED,
      isWalkIn: false,
      timezone,
      notes: request.notes,
      version: 1
    });

    // Update table status
    tableStore.update(selectedTable.id, { status: TableStatus.RESERVED });

    return reservation;
  }).then(result => {
    if (result.success) {
      return { success: true, data: result.result };
    } else {
      // Map error to proper error response
      const errorCode = result.error as ReservationErrorCode || 'UNKNOWN_ERROR';
      return {
        success: false,
        error: {
          code: errorCode,
          message: getErrorMessage(errorCode)
        }
      };
    }
  });
}

/**
 * Gets a reservation by ID
 */
export function getReservation(id: UUID): Result<Reservation> {
  const reservation = reservationStore.getById(id);
  
  if (!reservation) {
    return {
      success: false,
      error: {
        code: ReservationErrorCode.RESERVATION_NOT_FOUND,
        message: `Reservation not found: ${id}`
      }
    };
  }

  return { success: true, data: reservation };
}

/**
 * Gets all reservations with optional filters
 */
export function getReservations(filters?: {
  status?: ReservationStatus;
  date?: Date;
  tableId?: UUID;
  customerId?: UUID;
}): Reservation[] {
  let reservations = reservationStore.getAll();

  if (filters?.status) {
    reservations = reservations.filter(r => r.status === filters.status);
  }

  if (filters?.date) {
    reservations = reservationStore.findByDate(filters.date);
  }

  if (filters?.tableId) {
    reservations = reservations.filter(r => r.tableId === filters.tableId);
  }

  if (filters?.customerId) {
    reservations = reservations.filter(r => r.customerId === filters.customerId);
  }

  return reservations.sort((a, b) => 
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

/**
 * Updates a reservation status
 * Uses optimistic locking to prevent race conditions
 */
export function updateReservationStatus(
  id: UUID,
  newStatus: ReservationStatus,
  expectedVersion: number
): Result<Reservation> {
  const existing = reservationStore.getById(id);
  
  if (!existing) {
    return {
      success: false,
      error: {
        code: ReservationErrorCode.RESERVATION_NOT_FOUND,
        message: `Reservation not found: ${id}`
      }
    };
  }

  // Validate status transition
  if (!isValidStatusTransition(existing.status, newStatus)) {
    return {
      success: false,
      error: {
        code: ReservationErrorCode.INVALID_STATUS_TRANSITION,
        message: `Cannot transition from ${existing.status} to ${newStatus}`
      }
    };
  }

  // Use optimistic locking
  const updated = reservationStore.updateWithVersion(id, { status: newStatus }, expectedVersion);
  
  if (!updated) {
    return {
      success: false,
      error: {
        code: ReservationErrorCode.CONCURRENT_MODIFICATION,
        message: 'Reservation was modified by another process. Please refresh and try again.'
      }
    };
  }

  // Update table status based on reservation status
  if (updated.tableId) {
    if (newStatus === ReservationStatus.SEATED) {
      tableStore.update(updated.tableId, { status: TableStatus.OCCUPIED });
    } else if (newStatus === ReservationStatus.COMPLETED || 
               newStatus === ReservationStatus.CANCELLED ||
               newStatus === ReservationStatus.NO_SHOW) {
      tableStore.update(updated.tableId, { status: TableStatus.CLEANING });
      // Auto-transition to available after a short time
      setTimeout(() => {
        tableStore.update(updated.tableId!, { status: TableStatus.AVAILABLE });
      }, 5000);
    }
  }

  return { success: true, data: updated };
}

/**
 * Cancels a reservation
 */
export function cancelReservation(id: UUID, expectedVersion: number): Result<Reservation> {
  return updateReservationStatus(id, ReservationStatus.CANCELLED, expectedVersion);
}

/**
 * Checks if a status transition is valid
 */
function isValidStatusTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  const validTransitions: Record<ReservationStatus, ReservationStatus[]> = {
    [ReservationStatus.PENDING]: [
      ReservationStatus.CONFIRMED,
      ReservationStatus.CANCELLED
    ],
    [ReservationStatus.CONFIRMED]: [
      ReservationStatus.SEATED,
      ReservationStatus.CANCELLED,
      ReservationStatus.NO_SHOW
    ],
    [ReservationStatus.SEATED]: [
      ReservationStatus.COMPLETED
    ],
    [ReservationStatus.COMPLETED]: [],
    [ReservationStatus.CANCELLED]: [],
    [ReservationStatus.NO_SHOW]: []
  };

  return validTransitions[from].includes(to);
}

/**
 * Gets human-readable error message
 */
function getErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    [ReservationErrorCode.INVALID_PARTY_SIZE]: 'Invalid party size',
    [ReservationErrorCode.INVALID_TIME]: 'Invalid reservation time',
    [ReservationErrorCode.PAST_TIME]: 'Reservation time must be in the future',
    [ReservationErrorCode.NO_AVAILABILITY]: 'No tables available for the requested time and party size',
    [ReservationErrorCode.TABLE_NOT_FOUND]: 'Requested table not found',
    [ReservationErrorCode.TABLE_UNAVAILABLE]: 'Requested table is not available',
    [ReservationErrorCode.RESERVATION_NOT_FOUND]: 'Reservation not found',
    [ReservationErrorCode.CONCURRENT_MODIFICATION]: 'Concurrent modification detected',
    [ReservationErrorCode.INVALID_TIMEZONE]: 'Invalid timezone',
    [ReservationErrorCode.INVALID_STATUS_TRANSITION]: 'Invalid status transition'
  };

  return messages[code] || 'An unknown error occurred';
}

/**
 * Gets upcoming reservations
 */
export function getUpcomingReservations(hours: number = 24): Reservation[] {
  return reservationStore.findUpcoming(hours);
}

/**
 * Gets today's reservations
 */
export function getTodaysReservations(): Reservation[] {
  return reservationStore.findByDate(new Date());
}
