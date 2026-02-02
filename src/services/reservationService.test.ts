/**
 * Tests for Reservation Service
 * Task #1: Reservation Management
 * Task #5: Create Reservation
 * 
 * Acceptance Criteria for Create Reservation (Task #5):
 * - Given a customer requests a reservation
 * - When I enter their name, party size, and desired start time
 * - Then the system checks availability and confirms the reservation if possible
 */

import {
  createReservation,
  checkAvailability,
  getReservation,
  getReservations,
  updateReservationStatus,
  cancelReservation,
  findAvailableTables,
  ReservationErrorCode
} from '../services/reservationService';
import {
  initializeSampleData,
  resetStores,
  tableStore,
  reservationStore
} from '../data/store';
import { ReservationStatus, TableStatus } from '../types';
import { clearAllLocks } from '../utils/locking';

describe('Reservation Service', () => {
  beforeEach(() => {
    resetStores();
    initializeSampleData();
    clearAllLocks();
  });

  describe('Task #5: Create Reservation', () => {
    it('should create a reservation when given valid customer details', async () => {
      // Given a customer requests a reservation
      const request = {
        customerName: 'John Doe',
        customerPhone: '555-1234',
        partySize: 4,
        startTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        timezone: 'America/New_York'
      };

      // When I enter their name, party size, and desired start time
      const result = await createReservation(request);

      // Then the system checks availability and confirms the reservation if possible
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.customerName).toBe('John Doe');
      expect(result.data!.partySize).toBe(4);
      expect(result.data!.status).toBe(ReservationStatus.CONFIRMED);
      expect(result.data!.tableId).toBeDefined();
    });

    it('should reject reservation with invalid party size', async () => {
      const request = {
        customerName: 'John Doe',
        partySize: 0,
        startTime: new Date(Date.now() + 3600000).toISOString()
      };

      const result = await createReservation(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ReservationErrorCode.INVALID_PARTY_SIZE);
    });

    it('should reject reservation in the past', async () => {
      const request = {
        customerName: 'John Doe',
        partySize: 4,
        startTime: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
      };

      const result = await createReservation(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ReservationErrorCode.PAST_TIME);
    });

    it('should reject reservation with invalid timezone', async () => {
      const request = {
        customerName: 'John Doe',
        partySize: 4,
        startTime: new Date(Date.now() + 3600000).toISOString(),
        timezone: 'Invalid/Timezone'
      };

      const result = await createReservation(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ReservationErrorCode.INVALID_TIMEZONE);
    });
  });

  describe('Task #1: Reservation Management - Availability', () => {
    it('should check availability and return available tables', () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();
      
      const result = checkAvailability({
        startTime,
        partySize: 4
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.length).toBeGreaterThan(0);
      expect(result.data![0].isAvailable).toBe(true);
    });

    it('should find tables that fit the party size', () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();
      const endTime = new Date(Date.now() + 7200000).toISOString();

      const tables = findAvailableTables(startTime, endTime, 4);

      expect(tables.length).toBeGreaterThan(0);
      tables.forEach(table => {
        expect(table.capacity).toBeGreaterThanOrEqual(4);
      });
    });

    it('should prevent double bookings', async () => {
      const startTime = new Date(Date.now() + 3600000).toISOString();

      // Create first reservation
      const first = await createReservation({
        customerName: 'First Customer',
        partySize: 2,
        startTime
      });

      expect(first.success).toBe(true);
      const firstTableId = first.data!.tableId;

      // The same table should not be available for overlapping time
      const endTime = new Date(Date.now() + 7200000).toISOString();
      const availableTables = findAvailableTables(startTime, endTime, 2);
      
      const firstTableStillAvailable = availableTables.find(t => t.id === firstTableId);
      expect(firstTableStillAvailable).toBeUndefined();
    });
  });

  describe('Task #1: Reservation Management - CRUD Operations', () => {
    it('should get a reservation by ID', async () => {
      const createResult = await createReservation({
        customerName: 'Test Customer',
        partySize: 2,
        startTime: new Date(Date.now() + 3600000).toISOString()
      });

      const getResult = getReservation(createResult.data!.id);

      expect(getResult.success).toBe(true);
      expect(getResult.data!.id).toBe(createResult.data!.id);
    });

    it('should return error for non-existent reservation', () => {
      const result = getReservation('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ReservationErrorCode.RESERVATION_NOT_FOUND);
    });

    it('should list reservations with filters', async () => {
      // Create multiple reservations
      await createReservation({
        customerName: 'Customer 1',
        partySize: 2,
        startTime: new Date(Date.now() + 3600000).toISOString()
      });

      await createReservation({
        customerName: 'Customer 2',
        partySize: 4,
        startTime: new Date(Date.now() + 7200000).toISOString()
      });

      const allReservations = getReservations();
      expect(allReservations.length).toBe(2);

      const confirmedReservations = getReservations({ status: ReservationStatus.CONFIRMED });
      expect(confirmedReservations.length).toBe(2);
    });

    it('should cancel a reservation', async () => {
      const createResult = await createReservation({
        customerName: 'To Cancel',
        partySize: 2,
        startTime: new Date(Date.now() + 3600000).toISOString()
      });

      const cancelResult = cancelReservation(
        createResult.data!.id,
        createResult.data!.version
      );

      expect(cancelResult.success).toBe(true);
      expect(cancelResult.data!.status).toBe(ReservationStatus.CANCELLED);
    });
  });

  describe('Task #7: Prevent Race Conditions - Optimistic Locking', () => {
    it('should detect concurrent modifications', async () => {
      const createResult = await createReservation({
        customerName: 'Concurrent Test',
        partySize: 2,
        startTime: new Date(Date.now() + 3600000).toISOString()
      });

      const reservation = createResult.data!;

      // First update succeeds
      const update1 = updateReservationStatus(
        reservation.id,
        ReservationStatus.SEATED,
        reservation.version
      );
      expect(update1.success).toBe(true);

      // Second update with old version fails
      const update2 = updateReservationStatus(
        reservation.id,
        ReservationStatus.COMPLETED,
        reservation.version // Using old version
      );
      expect(update2.success).toBe(false);
      expect(update2.error?.code).toBe(ReservationErrorCode.CONCURRENT_MODIFICATION);
    });
  });
});
