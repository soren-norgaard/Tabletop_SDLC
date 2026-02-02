/**
 * Tests for Locking/Concurrency Utilities
 * Task #3: System Reliability and Usability
 * Task #7: Prevent Race Conditions
 * 
 * Acceptance Criteria for Prevent Race Conditions (Task #7):
 * - Given multiple reservation requests occur simultaneously
 * - When the system processes these requests
 * - Then no race conditions occur and reservations are handled correctly
 */

import {
  acquireLock,
  releaseLock,
  isLocked,
  acquireMultipleLocks,
  releaseMultipleLocks,
  withLock,
  cleanupExpiredLocks,
  clearAllLocks,
  getLockCount
} from '../utils/locking';

describe('Locking Utilities', () => {
  beforeEach(() => {
    clearAllLocks();
  });

  describe('Task #7: Prevent Race Conditions - Basic Locking', () => {
    it('should acquire a lock successfully', () => {
      const result = acquireLock('table', 'table-1', 'owner-1');
      
      expect(result.success).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock!.resourceId).toBe('table-1');
      expect(result.lock!.lockedBy).toBe('owner-1');
    });

    it('should prevent acquiring a lock that is already held', () => {
      // First acquisition
      const first = acquireLock('table', 'table-1', 'owner-1');
      expect(first.success).toBe(true);

      // Second acquisition by different owner should fail
      const second = acquireLock('table', 'table-1', 'owner-2');
      expect(second.success).toBe(false);
      expect(second.error).toContain('locked');
    });

    it('should allow same owner to re-acquire lock', () => {
      const first = acquireLock('table', 'table-1', 'owner-1');
      expect(first.success).toBe(true);

      // Same owner can re-acquire
      const second = acquireLock('table', 'table-1', 'owner-1');
      expect(second.success).toBe(true);
    });

    it('should release a lock successfully', () => {
      acquireLock('table', 'table-1', 'owner-1');
      
      const released = releaseLock('table', 'table-1', 'owner-1');
      expect(released).toBe(true);

      // Lock should now be available
      const newLock = acquireLock('table', 'table-1', 'owner-2');
      expect(newLock.success).toBe(true);
    });

    it('should not release lock held by different owner', () => {
      acquireLock('table', 'table-1', 'owner-1');
      
      const released = releaseLock('table', 'table-1', 'owner-2');
      expect(released).toBe(false);
    });
  });

  describe('Task #7: Prevent Race Conditions - Lock Status', () => {
    it('should check if resource is locked', () => {
      expect(isLocked('table', 'table-1')).toBe(false);
      
      acquireLock('table', 'table-1', 'owner-1');
      expect(isLocked('table', 'table-1')).toBe(true);
      
      releaseLock('table', 'table-1', 'owner-1');
      expect(isLocked('table', 'table-1')).toBe(false);
    });

    it('should track lock count', () => {
      expect(getLockCount()).toBe(0);
      
      acquireLock('table', 'table-1', 'owner-1');
      expect(getLockCount()).toBe(1);
      
      acquireLock('table', 'table-2', 'owner-1');
      expect(getLockCount()).toBe(2);
      
      releaseLock('table', 'table-1', 'owner-1');
      expect(getLockCount()).toBe(1);
    });
  });

  describe('Task #7: Prevent Race Conditions - Multiple Locks', () => {
    it('should acquire multiple locks atomically', () => {
      const resources = [
        { type: 'table' as const, id: 'table-1' },
        { type: 'table' as const, id: 'table-2' },
        { type: 'reservation' as const, id: 'res-1' }
      ];

      const result = acquireMultipleLocks(resources, 'owner-1');
      
      expect(result.success).toBe(true);
      expect(isLocked('table', 'table-1')).toBe(true);
      expect(isLocked('table', 'table-2')).toBe(true);
      expect(isLocked('reservation', 'res-1')).toBe(true);
    });

    it('should rollback all locks if one fails', () => {
      // Pre-lock one resource
      acquireLock('table', 'table-2', 'other-owner');

      const resources = [
        { type: 'table' as const, id: 'table-1' },
        { type: 'table' as const, id: 'table-2' }, // This will fail
        { type: 'reservation' as const, id: 'res-1' }
      ];

      const result = acquireMultipleLocks(resources, 'owner-1');
      
      expect(result.success).toBe(false);
      // table-1 should be rolled back
      expect(isLocked('table', 'table-1')).toBe(false);
      // table-2 is still locked by other owner
      expect(isLocked('table', 'table-2')).toBe(true);
    });

    it('should release multiple locks', () => {
      const resources = [
        { type: 'table' as const, id: 'table-1' },
        { type: 'table' as const, id: 'table-2' }
      ];

      acquireMultipleLocks(resources, 'owner-1');
      releaseMultipleLocks(resources, 'owner-1');
      
      expect(isLocked('table', 'table-1')).toBe(false);
      expect(isLocked('table', 'table-2')).toBe(false);
    });
  });

  describe('Task #3: System Reliability - Lock with Function', () => {
    it('should execute function with lock held', async () => {
      let executed = false;
      
      const result = await withLock('table', 'table-1', () => {
        executed = true;
        return 'success';
      });
      
      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(executed).toBe(true);
      // Lock should be released after
      expect(isLocked('table', 'table-1')).toBe(false);
    });

    it('should handle async functions with lock', async () => {
      const result = await withLock('table', 'table-1', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-success';
      });
      
      expect(result.success).toBe(true);
      expect(result.result).toBe('async-success');
    });

    it('should release lock even if function throws', async () => {
      const result = await withLock('table', 'table-1', () => {
        throw new Error('Test error');
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
      // Lock should still be released
      expect(isLocked('table', 'table-1')).toBe(false);
    });

    it('should fail if lock cannot be acquired', async () => {
      // Pre-lock the resource
      acquireLock('table', 'table-1', 'other-owner');

      const result = await withLock('table', 'table-1', () => {
        return 'should-not-run';
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('locked');
    });
  });

  describe('Task #3: System Reliability - Lock Cleanup', () => {
    it('should clean up expired locks', async () => {
      // Acquire a lock with very short timeout
      acquireLock('table', 'table-1', 'owner-1', 0.001); // 0.001 minutes = ~60ms
      
      // Wait for lock to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const cleaned = cleanupExpiredLocks();
      expect(cleaned).toBeGreaterThanOrEqual(1);
      expect(isLocked('table', 'table-1')).toBe(false);
    });

    it('should clear all locks', () => {
      acquireLock('table', 'table-1', 'owner-1');
      acquireLock('table', 'table-2', 'owner-2');
      
      expect(getLockCount()).toBe(2);
      
      clearAllLocks();
      
      expect(getLockCount()).toBe(0);
    });
  });

  describe('Task #7: Concurrent Request Simulation', () => {
    it('should handle concurrent reservation attempts safely', async () => {
      // Simulate concurrent reservation requests for same table/time
      const tableId = 'popular-table';
      const results: string[] = [];

      // Launch multiple "concurrent" requests
      const promises = Array.from({ length: 5 }, (_, i) =>
        withLock('table', tableId, async () => {
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          results.push(`reservation-${i}`);
          return `reservation-${i}`;
        })
      );

      const outcomes = await Promise.all(promises);
      
      // With concurrent lock requests, only the first one should succeed
      // Others will fail because the lock is held
      const successful = outcomes.filter(o => o.success);
      const failed = outcomes.filter(o => !o.success);
      
      // At least one should succeed, and the total should be 5
      expect(successful.length).toBeGreaterThanOrEqual(1);
      expect(successful.length + failed.length).toBe(5);
      
      // No double-processing should occur due to locking
      expect(results.length).toBe(successful.length);
    });
  });
});
