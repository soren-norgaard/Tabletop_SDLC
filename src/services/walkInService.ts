/**
 * Walk-In Service
 * Task #2: Walk-in Support
 * Task #6: Handle Walk-ins
 * 
 * Functionality:
 * - Accommodate walk-in guests when tables are available
 * - Assign tables and waiters to walk-in parties
 * - Handle immediate seating without advance reservation
 * 
 * Acceptance Criteria:
 * - Given a walk-in guest arrives
 * - When I initiate a walk-in
 * - Then the system checks current availability and confirms the walk-in if possible
 */

import { v4 as uuidv4 } from 'uuid';
import {
  UUID,
  Reservation,
  ReservationStatus,
  TableStatus,
  WalkInRequest,
  Result,
  Table,
  Waiter
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
  DEFAULT_TIMEZONE,
  DEFAULT_DURATION_MINUTES
} from '../utils/timezone';
import { withLock } from '../utils/locking';

/** Walk-in error codes */
export enum WalkInErrorCode {
  INVALID_PARTY_SIZE = 'INVALID_PARTY_SIZE',
  NO_AVAILABLE_TABLES = 'NO_AVAILABLE_TABLES',
  INVALID_CUSTOMER_NAME = 'INVALID_CUSTOMER_NAME',
  SYSTEM_ERROR = 'SYSTEM_ERROR'
}

/** Walk-in result with assigned resources */
export interface WalkInResult {
  reservation: Reservation;
  table: Table;
  waiter?: Waiter;
}

/**
 * Validates a walk-in request
 */
function validateWalkInRequest(request: WalkInRequest): Result<void> {
  if (!request.customerName || request.customerName.trim().length === 0) {
    return {
      success: false,
      error: {
        code: WalkInErrorCode.INVALID_CUSTOMER_NAME,
        message: 'Customer name is required'
      }
    };
  }

  if (!request.partySize || request.partySize < 1) {
    return {
      success: false,
      error: {
        code: WalkInErrorCode.INVALID_PARTY_SIZE,
        message: 'Party size must be at least 1'
      }
    };
  }

  if (request.partySize > 20) {
    return {
      success: false,
      error: {
        code: WalkInErrorCode.INVALID_PARTY_SIZE,
        message: 'Party size cannot exceed 20. Please contact us for large groups.'
      }
    };
  }

  return { success: true };
}

/**
 * Finds the best available table for a walk-in
 * Prioritizes:
 * 1. Tables that exactly match party size
 * 2. Smallest table that fits the party
 * 3. Tables in sections with available waiters
 */
function findBestTableForWalkIn(partySize: number): Table | undefined {
  // Get all available tables that can accommodate the party
  const availableTables = tableStore.findAvailableForPartySize(partySize);

  if (availableTables.length === 0) {
    return undefined;
  }

  // Sort by capacity (prefer exact match, then smallest)
  const sorted = availableTables.sort((a, b) => {
    // Exact match gets highest priority
    const aExact = a.capacity === partySize ? 0 : 1;
    const bExact = b.capacity === partySize ? 0 : 1;
    
    if (aExact !== bExact) {
      return aExact - bExact;
    }

    // Then by capacity (smallest first to optimize table usage)
    return a.capacity - b.capacity;
  });

  return sorted[0];
}

/**
 * Assigns a waiter to a table for a walk-in
 */
function assignWaiterToTable(tableId: UUID): Waiter | undefined {
  const waiter = waiterStore.findWithLeastTables();
  
  if (waiter) {
    waiterStore.assignTable(waiter.id, tableId);
    return waiterStore.getById(waiter.id);
  }

  return undefined;
}

/**
 * Handles a walk-in guest
 * Task #6 Acceptance Criteria:
 * - Given a walk-in guest arrives
 * - When I initiate a walk-in
 * - Then the system checks current availability and confirms the walk-in if possible
 */
export async function handleWalkIn(request: WalkInRequest): Promise<Result<WalkInResult>> {
  // Validate request
  const validation = validateWalkInRequest(request);
  if (!validation.success) {
    return validation as Result<WalkInResult>;
  }

  // Use locking to prevent race conditions
  const lockId = `walkin:${Date.now()}`;

  return await withLock('table', lockId, async () => {
    // Find available table
    const table = findBestTableForWalkIn(request.partySize);

    if (!table) {
      throw new Error(WalkInErrorCode.NO_AVAILABLE_TABLES);
    }

    // Create walk-in customer
    const customer = customerStore.create({
      name: request.customerName,
      notes: 'Walk-in customer'
    });

    // Calculate times
    const startTime = nowUTC();
    const endTime = calculateEndTime(startTime, DEFAULT_DURATION_MINUTES);

    // Assign waiter
    const waiter = assignWaiterToTable(table.id);

    // Create reservation for tracking
    const reservation = reservationStore.create({
      customerId: customer.id,
      customerName: request.customerName,
      partySize: request.partySize,
      tableId: table.id,
      waiterId: waiter?.id,
      startTime,
      endTime,
      status: ReservationStatus.SEATED, // Walk-ins are immediately seated
      isWalkIn: true,
      timezone: DEFAULT_TIMEZONE,
      notes: request.notes || 'Walk-in',
      version: 1
    });

    // Update table status
    tableStore.update(table.id, { status: TableStatus.OCCUPIED });

    return {
      reservation,
      table: tableStore.getById(table.id)!,
      waiter
    };
  }).then(result => {
    if (result.success && result.result) {
      return { success: true, data: result.result };
    } else {
      const errorCode = result.error as WalkInErrorCode || WalkInErrorCode.SYSTEM_ERROR;
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
 * Checks if walk-ins can be accommodated
 */
export function canAccommodateWalkIn(partySize: number): Result<{ available: boolean; tables: Table[] }> {
  if (partySize < 1 || partySize > 20) {
    return {
      success: false,
      error: {
        code: WalkInErrorCode.INVALID_PARTY_SIZE,
        message: 'Party size must be between 1 and 20'
      }
    };
  }

  const availableTables = tableStore.findAvailableForPartySize(partySize);

  return {
    success: true,
    data: {
      available: availableTables.length > 0,
      tables: availableTables
    }
  };
}

/**
 * Gets all current walk-ins
 */
export function getCurrentWalkIns(): Reservation[] {
  return reservationStore.findWalkIns().filter(r => 
    r.status === ReservationStatus.SEATED
  );
}

/**
 * Gets walk-in statistics for today
 */
export function getWalkInStats(): {
  total: number;
  currentlySeated: number;
  completed: number;
} {
  const todaysWalkIns = reservationStore.findByDate(new Date()).filter(r => r.isWalkIn);
  
  return {
    total: todaysWalkIns.length,
    currentlySeated: todaysWalkIns.filter(r => r.status === ReservationStatus.SEATED).length,
    completed: todaysWalkIns.filter(r => r.status === ReservationStatus.COMPLETED).length
  };
}

/**
 * Gets human-readable error message
 */
function getErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    [WalkInErrorCode.INVALID_PARTY_SIZE]: 'Invalid party size',
    [WalkInErrorCode.NO_AVAILABLE_TABLES]: 'No tables currently available for walk-ins. Please wait or make a reservation.',
    [WalkInErrorCode.INVALID_CUSTOMER_NAME]: 'Customer name is required',
    [WalkInErrorCode.SYSTEM_ERROR]: 'An error occurred processing the walk-in'
  };

  return messages[code] || 'An unknown error occurred';
}

/**
 * Gets estimated wait time for a walk-in party
 */
export function getEstimatedWaitTime(partySize: number): Result<{ minutes: number; message: string }> {
  const availableTables = tableStore.findAvailableForPartySize(partySize);

  if (availableTables.length > 0) {
    return {
      success: true,
      data: {
        minutes: 0,
        message: 'Tables available now!'
      }
    };
  }

  // Check upcoming reservation completions
  const seatedReservations = reservationStore.findByStatus(ReservationStatus.SEATED)
    .filter(r => {
      const table = tableStore.getById(r.tableId || '');
      return table && table.capacity >= partySize;
    })
    .sort((a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime());

  if (seatedReservations.length === 0) {
    return {
      success: true,
      data: {
        minutes: -1,
        message: 'Unable to estimate wait time. All tables are occupied with no scheduled end time.'
      }
    };
  }

  const nextAvailable = seatedReservations[0];
  const now = new Date();
  const endTime = new Date(nextAvailable.endTime);
  const waitMinutes = Math.max(0, Math.ceil((endTime.getTime() - now.getTime()) / 60000));

  return {
    success: true,
    data: {
      minutes: waitMinutes,
      message: waitMinutes <= 15 
        ? 'Short wait expected'
        : `Estimated wait: approximately ${waitMinutes} minutes`
    }
  };
}
