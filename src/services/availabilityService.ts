/**
 * Availability Service
 * Task #1: Reservation Management - Calculating availability
 * Task #3: System Reliability and Usability
 * 
 * Provides:
 * - Real-time availability checking
 * - Optimized table suggestions
 * - Prevents overbooking
 */

import {
  UUID,
  Table,
  TableStatus,
  AvailabilityRequest,
  AvailabilitySlot,
  Result
} from '../types';
import { reservationStore, tableStore } from '../data/store';
import {
  calculateEndTime,
  doTimeRangesOverlap,
  isValidTimezone,
  DEFAULT_TIMEZONE,
  DEFAULT_DURATION_MINUTES,
  addMinutes,
  getDayBoundsInTimezone
} from '../utils/timezone';
import { ReservationStatus } from '../types';

/** Time slot configuration */
const SLOT_DURATION_MINUTES = 30;
const OPERATING_HOURS_START = 11; // 11 AM
const OPERATING_HOURS_END = 22; // 10 PM

/**
 * Checks if a specific table is available for a time range
 */
export function isTableAvailable(
  tableId: UUID,
  startTime: string,
  endTime: string
): boolean {
  const table = tableStore.getById(tableId);
  
  if (!table || table.status === TableStatus.OUT_OF_SERVICE) {
    return false;
  }

  const overlappingReservations = reservationStore
    .findByTimeRange(new Date(startTime), new Date(endTime))
    .filter(r => 
      r.tableId === tableId &&
      r.status !== ReservationStatus.CANCELLED &&
      r.status !== ReservationStatus.COMPLETED &&
      r.status !== ReservationStatus.NO_SHOW
    );

  return overlappingReservations.length === 0;
}

/**
 * Gets all available time slots for a date
 */
export function getAvailableSlots(
  date: string,
  partySize: number,
  timezone: string = DEFAULT_TIMEZONE,
  durationMinutes: number = DEFAULT_DURATION_MINUTES
): Result<AvailabilitySlot[]> {
  if (!isValidTimezone(timezone)) {
    return {
      success: false,
      error: {
        code: 'INVALID_TIMEZONE',
        message: `Invalid timezone: ${timezone}`
      }
    };
  }

  if (partySize < 1 || partySize > 20) {
    return {
      success: false,
      error: {
        code: 'INVALID_PARTY_SIZE',
        message: 'Party size must be between 1 and 20'
      }
    };
  }

  const { start: dayStart, end: dayEnd } = getDayBoundsInTimezone(date, timezone);
  
  // Get suitable tables
  const suitableTables = tableStore.findByCapacity(partySize)
    .filter(t => t.status !== TableStatus.OUT_OF_SERVICE);

  if (suitableTables.length === 0) {
    return {
      success: true,
      data: []
    };
  }

  const slots: AvailabilitySlot[] = [];
  
  // Generate time slots for operating hours
  const operatingStart = new Date(dayStart);
  operatingStart.setUTCHours(OPERATING_HOURS_START, 0, 0, 0);
  
  const operatingEnd = new Date(dayStart);
  operatingEnd.setUTCHours(OPERATING_HOURS_END, 0, 0, 0);

  const now = new Date();
  let currentSlot = new Date(operatingStart);

  while (currentSlot < operatingEnd) {
    const slotStart = currentSlot.toISOString();
    const slotEnd = addMinutes(currentSlot, durationMinutes).toISOString();

    // Skip past time slots
    if (currentSlot > now) {
      for (const table of suitableTables) {
        const isAvailable = isTableAvailable(table.id, slotStart, slotEnd);
        
        if (isAvailable) {
          slots.push({
            tableId: table.id,
            tableNumber: table.number,
            tableCapacity: table.capacity,
            startTime: slotStart,
            endTime: slotEnd,
            isAvailable: true
          });
        }
      }
    }

    currentSlot = addMinutes(currentSlot, SLOT_DURATION_MINUTES);
  }

  return { success: true, data: slots };
}

/**
 * Gets the next available slot for a party size
 */
export function getNextAvailableSlot(
  partySize: number,
  fromTime: string = new Date().toISOString(),
  durationMinutes: number = DEFAULT_DURATION_MINUTES
): Result<AvailabilitySlot | null> {
  const suitableTables = tableStore.findByCapacity(partySize)
    .filter(t => t.status !== TableStatus.OUT_OF_SERVICE);

  if (suitableTables.length === 0) {
    return {
      success: true,
      data: null
    };
  }

  // Check current time first
  const now = new Date(fromTime);
  const endTime = addMinutes(now, durationMinutes);

  for (const table of suitableTables) {
    if (isTableAvailable(table.id, now.toISOString(), endTime.toISOString())) {
      return {
        success: true,
        data: {
          tableId: table.id,
          tableNumber: table.number,
          tableCapacity: table.capacity,
          startTime: now.toISOString(),
          endTime: endTime.toISOString(),
          isAvailable: true
        }
      };
    }
  }

  // Find next available slot
  let checkTime = addMinutes(now, SLOT_DURATION_MINUTES);
  const maxSearchHours = 24;
  const searchEnd = addMinutes(now, maxSearchHours * 60);

  while (checkTime < searchEnd) {
    const slotEnd = addMinutes(checkTime, durationMinutes);
    
    for (const table of suitableTables) {
      if (isTableAvailable(table.id, checkTime.toISOString(), slotEnd.toISOString())) {
        return {
          success: true,
          data: {
            tableId: table.id,
            tableNumber: table.number,
            tableCapacity: table.capacity,
            startTime: checkTime.toISOString(),
            endTime: slotEnd.toISOString(),
            isAvailable: true
          }
        };
      }
    }

    checkTime = addMinutes(checkTime, SLOT_DURATION_MINUTES);
  }

  return { success: true, data: null };
}

/**
 * Gets availability summary for a date
 */
export function getAvailabilitySummary(date: string, timezone: string = DEFAULT_TIMEZONE): Result<{
  totalTables: number;
  availableNow: number;
  bookedSlots: number;
  peakHours: { hour: number; bookings: number }[];
}> {
  if (!isValidTimezone(timezone)) {
    return {
      success: false,
      error: {
        code: 'INVALID_TIMEZONE',
        message: `Invalid timezone: ${timezone}`
      }
    };
  }

  const allTables = tableStore.getAll().filter(t => t.status !== TableStatus.OUT_OF_SERVICE);
  const availableNow = tableStore.findAvailable().length;

  const { start: dayStart, end: dayEnd } = getDayBoundsInTimezone(date, timezone);
  const dayReservations = reservationStore.findByTimeRange(dayStart, dayEnd)
    .filter(r => 
      r.status !== ReservationStatus.CANCELLED &&
      r.status !== ReservationStatus.NO_SHOW
    );

  // Calculate peak hours
  const hourlyBookings: Record<number, number> = {};
  for (let h = OPERATING_HOURS_START; h <= OPERATING_HOURS_END; h++) {
    hourlyBookings[h] = 0;
  }

  for (const reservation of dayReservations) {
    const startHour = new Date(reservation.startTime).getUTCHours();
    if (hourlyBookings[startHour] !== undefined) {
      hourlyBookings[startHour]++;
    }
  }

  const peakHours = Object.entries(hourlyBookings)
    .map(([hour, bookings]) => ({ hour: parseInt(hour), bookings }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 3);

  return {
    success: true,
    data: {
      totalTables: allTables.length,
      availableNow,
      bookedSlots: dayReservations.length,
      peakHours
    }
  };
}

/**
 * Suggests optimal tables for a party
 */
export function suggestTables(
  partySize: number,
  startTime: string,
  preferences?: {
    section?: string;
    nearWindow?: boolean;
    quiet?: boolean;
  }
): Table[] {
  const endTime = calculateEndTime(startTime, DEFAULT_DURATION_MINUTES);
  const availableTables = tableStore.findByCapacity(partySize)
    .filter(t => isTableAvailable(t.id, startTime, endTime));

  // Sort by preference
  return availableTables.sort((a, b) => {
    // Prefer exact capacity match
    const aExact = a.capacity === partySize ? 0 : 1;
    const bExact = b.capacity === partySize ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    // Filter by section preference
    if (preferences?.section) {
      const aSection = a.section === preferences.section ? 0 : 1;
      const bSection = b.section === preferences.section ? 0 : 1;
      if (aSection !== bSection) return aSection - bSection;
    }

    // Default: smallest capacity first
    return a.capacity - b.capacity;
  });
}
