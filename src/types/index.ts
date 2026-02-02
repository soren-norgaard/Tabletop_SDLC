/**
 * Core type definitions for the Restaurant Reservation System
 * Supports Tasks #1-8: Reservation Management, Walk-ins, Reliability, Timezone handling
 */

/** Unique identifier type */
export type UUID = string;

/** ISO 8601 datetime string with timezone */
export type ISODateTime = string;

/** Reservation status enum */
export enum ReservationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  SEATED = 'SEATED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW'
}

/** Table status enum */
export enum TableStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  RESERVED = 'RESERVED',
  CLEANING = 'CLEANING',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE'
}

/** Waiter assignment status */
export enum WaiterStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  ON_BREAK = 'ON_BREAK',
  OFF_DUTY = 'OFF_DUTY'
}

/** Customer information */
export interface Customer {
  id: UUID;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Table definition */
export interface Table {
  id: UUID;
  number: number;
  capacity: number;
  status: TableStatus;
  section?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Waiter/staff definition */
export interface Waiter {
  id: UUID;
  name: string;
  status: WaiterStatus;
  assignedTables: UUID[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Reservation definition */
export interface Reservation {
  id: UUID;
  customerId: UUID;
  customerName: string;
  partySize: number;
  tableId?: UUID;
  waiterId?: UUID;
  startTime: ISODateTime;
  endTime: ISODateTime;
  status: ReservationStatus;
  isWalkIn: boolean;
  timezone: string;
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  version: number; // For optimistic locking - prevents race conditions
}

/** Create reservation request */
export interface CreateReservationRequest {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  partySize: number;
  startTime: ISODateTime;
  timezone?: string;
  durationMinutes?: number;
  notes?: string;
  preferredTableId?: UUID;
}

/** Walk-in request */
export interface WalkInRequest {
  customerName: string;
  partySize: number;
  notes?: string;
}

/** Availability check request */
export interface AvailabilityRequest {
  startTime: ISODateTime;
  partySize: number;
  timezone?: string;
  durationMinutes?: number;
}

/** Availability slot result */
export interface AvailabilitySlot {
  tableId: UUID;
  tableNumber: number;
  tableCapacity: number;
  startTime: ISODateTime;
  endTime: ISODateTime;
  isAvailable: boolean;
}

/** Result wrapper with success/error handling */
export interface Result<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** Pagination parameters */
export interface PaginationParams {
  page: number;
  limit: number;
}

/** Paginated result */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Lock for concurrent access control */
export interface ResourceLock {
  resourceType: 'table' | 'reservation' | 'timeslot';
  resourceId: UUID;
  lockedBy: string;
  lockedAt: ISODateTime;
  expiresAt: ISODateTime;
}
