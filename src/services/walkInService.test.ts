/**
 * Tests for Walk-In Service
 * Task #2: Walk-in Support
 * Task #6: Handle Walk-ins
 * 
 * Acceptance Criteria for Handle Walk-ins (Task #6):
 * - Given a walk-in guest arrives
 * - When I initiate a walk-in
 * - Then the system checks current availability and confirms the walk-in if possible
 */

import {
  handleWalkIn,
  canAccommodateWalkIn,
  getCurrentWalkIns,
  getWalkInStats,
  getEstimatedWaitTime,
  WalkInErrorCode
} from '../services/walkInService';
import {
  initializeSampleData,
  resetStores,
  tableStore,
  reservationStore
} from '../data/store';
import { TableStatus, ReservationStatus } from '../types';
import { clearAllLocks } from '../utils/locking';

describe('Walk-In Service', () => {
  beforeEach(() => {
    resetStores();
    initializeSampleData();
    clearAllLocks();
  });

  describe('Task #6: Handle Walk-ins', () => {
    it('should handle a walk-in guest when tables are available', async () => {
      // Given a walk-in guest arrives
      const request = {
        customerName: 'Walk-In Guest',
        partySize: 2
      };

      // When I initiate a walk-in
      const result = await handleWalkIn(request);

      // Then the system checks current availability and confirms the walk-in if possible
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.reservation).toBeDefined();
      expect(result.data!.reservation.isWalkIn).toBe(true);
      expect(result.data!.reservation.status).toBe(ReservationStatus.SEATED);
      expect(result.data!.table).toBeDefined();
    });

    it('should assign a table to walk-in guests', async () => {
      const result = await handleWalkIn({
        customerName: 'Table Test',
        partySize: 4
      });

      expect(result.success).toBe(true);
      expect(result.data!.table.capacity).toBeGreaterThanOrEqual(4);
      
      // Table should be marked as occupied
      const table = tableStore.getById(result.data!.table.id);
      expect(table?.status).toBe(TableStatus.OCCUPIED);
    });

    it('should assign a waiter to walk-in guests', async () => {
      const result = await handleWalkIn({
        customerName: 'Waiter Test',
        partySize: 2
      });

      expect(result.success).toBe(true);
      expect(result.data!.waiter).toBeDefined();
    });

    it('should reject walk-in with invalid party size', async () => {
      const result = await handleWalkIn({
        customerName: 'Invalid Size',
        partySize: 0
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(WalkInErrorCode.INVALID_PARTY_SIZE);
    });

    it('should reject walk-in when no tables available', async () => {
      // Mark all tables as occupied
      const tables = tableStore.getAll();
      tables.forEach(table => {
        tableStore.update(table.id, { status: TableStatus.OCCUPIED });
      });

      const result = await handleWalkIn({
        customerName: 'No Tables',
        partySize: 2
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(WalkInErrorCode.NO_AVAILABLE_TABLES);
    });
  });

  describe('Task #2: Walk-in Support - Availability Check', () => {
    it('should check if walk-ins can be accommodated', () => {
      const result = canAccommodateWalkIn(4);

      expect(result.success).toBe(true);
      expect(result.data!.available).toBe(true);
      expect(result.data!.tables.length).toBeGreaterThan(0);
    });

    it('should return no availability when all tables occupied', () => {
      // Occupy all tables
      const tables = tableStore.getAll();
      tables.forEach(table => {
        tableStore.update(table.id, { status: TableStatus.OCCUPIED });
      });

      const result = canAccommodateWalkIn(4);

      expect(result.success).toBe(true);
      expect(result.data!.available).toBe(false);
      expect(result.data!.tables.length).toBe(0);
    });

    it('should handle large party sizes correctly', () => {
      const result = canAccommodateWalkIn(6);

      expect(result.success).toBe(true);
      // Should only return tables with capacity >= 6
      result.data!.tables.forEach(table => {
        expect(table.capacity).toBeGreaterThanOrEqual(6);
      });
    });
  });

  describe('Task #2: Walk-in Support - Tracking', () => {
    it('should track current walk-ins', async () => {
      await handleWalkIn({ customerName: 'Walk-in 1', partySize: 2 });
      await handleWalkIn({ customerName: 'Walk-in 2', partySize: 4 });

      const currentWalkIns = getCurrentWalkIns();

      expect(currentWalkIns.length).toBe(2);
      currentWalkIns.forEach(r => {
        expect(r.isWalkIn).toBe(true);
        expect(r.status).toBe(ReservationStatus.SEATED);
      });
    });

    it('should provide walk-in statistics', async () => {
      await handleWalkIn({ customerName: 'Stats Test 1', partySize: 2 });
      await handleWalkIn({ customerName: 'Stats Test 2', partySize: 2 });

      const stats = getWalkInStats();

      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.currentlySeated).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Task #2: Walk-in Support - Wait Time Estimation', () => {
    it('should return zero wait time when tables available', () => {
      const result = getEstimatedWaitTime(2);

      expect(result.success).toBe(true);
      expect(result.data!.minutes).toBe(0);
      expect(result.data!.message).toContain('available');
    });

    it('should estimate wait time when tables occupied', async () => {
      // Fill all small tables
      const tables = tableStore.getAll().filter(t => t.capacity <= 2);
      for (const table of tables) {
        tableStore.update(table.id, { status: TableStatus.OCCUPIED });
      }

      // Create a seated reservation with an end time
      const reservation = reservationStore.create({
        customerId: 'test',
        customerName: 'Test',
        partySize: 2,
        tableId: tables[0]?.id,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 30 * 60000).toISOString(), // 30 min from now
        status: ReservationStatus.SEATED,
        isWalkIn: false,
        timezone: 'UTC',
        version: 1
      });

      const result = getEstimatedWaitTime(2);

      expect(result.success).toBe(true);
      // Should have some wait time or report can't estimate
      expect(result.data!.message).toBeDefined();
    });
  });
});
