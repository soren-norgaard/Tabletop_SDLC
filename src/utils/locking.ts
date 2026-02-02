/**
 * Concurrency Control and Locking Module
 * Task #3 & #7: System Reliability, Prevent Race Conditions
 * 
 * Implements optimistic and pessimistic locking strategies to:
 * - Prevent double bookings when multiple requests occur simultaneously
 * - Ensure data integrity during concurrent operations
 * - Handle lock timeouts gracefully
 */

import { v4 as uuidv4 } from 'uuid';
import { ResourceLock, UUID } from '../types';
import { nowUTC, addMinutes } from './timezone';

/** Default lock timeout in minutes */
const DEFAULT_LOCK_TIMEOUT_MINUTES = 2;

/** In-memory lock storage (would be Redis in production) */
const locks = new Map<string, ResourceLock>();

/** Lock acquisition result */
export interface LockResult {
  success: boolean;
  lock?: ResourceLock;
  error?: string;
}

/**
 * Generates a composite key for a lock
 */
function getLockKey(resourceType: ResourceLock['resourceType'], resourceId: UUID): string {
  return `${resourceType}:${resourceId}`;
}

/**
 * Acquires a lock on a resource
 * Returns success if lock is acquired, failure if resource is already locked
 */
export function acquireLock(
  resourceType: ResourceLock['resourceType'],
  resourceId: UUID,
  lockOwner: string,
  timeoutMinutes: number = DEFAULT_LOCK_TIMEOUT_MINUTES
): LockResult {
  const key = getLockKey(resourceType, resourceId);
  const now = new Date();
  
  // Check if lock exists and is still valid
  const existingLock = locks.get(key);
  if (existingLock) {
    const expiresAt = new Date(existingLock.expiresAt);
    if (expiresAt > now && existingLock.lockedBy !== lockOwner) {
      return {
        success: false,
        error: `Resource is locked by another process until ${existingLock.expiresAt}`
      };
    }
  }
  
  // Create new lock
  const lock: ResourceLock = {
    resourceType,
    resourceId,
    lockedBy: lockOwner,
    lockedAt: nowUTC(),
    expiresAt: addMinutes(now, timeoutMinutes).toISOString()
  };
  
  locks.set(key, lock);
  
  return { success: true, lock };
}

/**
 * Releases a lock on a resource
 */
export function releaseLock(
  resourceType: ResourceLock['resourceType'],
  resourceId: UUID,
  lockOwner: string
): boolean {
  const key = getLockKey(resourceType, resourceId);
  const existingLock = locks.get(key);
  
  if (!existingLock) {
    return true; // Lock doesn't exist, consider it released
  }
  
  if (existingLock.lockedBy !== lockOwner) {
    return false; // Can't release someone else's lock
  }
  
  locks.delete(key);
  return true;
}

/**
 * Checks if a resource is currently locked
 */
export function isLocked(
  resourceType: ResourceLock['resourceType'],
  resourceId: UUID
): boolean {
  const key = getLockKey(resourceType, resourceId);
  const existingLock = locks.get(key);
  
  if (!existingLock) {
    return false;
  }
  
  const now = new Date();
  const expiresAt = new Date(existingLock.expiresAt);
  
  if (expiresAt <= now) {
    // Lock has expired, clean it up
    locks.delete(key);
    return false;
  }
  
  return true;
}

/**
 * Acquires multiple locks atomically
 * Either all locks are acquired or none are
 */
export function acquireMultipleLocks(
  resources: Array<{ type: ResourceLock['resourceType']; id: UUID }>,
  lockOwner: string,
  timeoutMinutes: number = DEFAULT_LOCK_TIMEOUT_MINUTES
): LockResult {
  const acquiredLocks: ResourceLock[] = [];
  
  // Sort resources to prevent deadlocks (consistent ordering)
  const sortedResources = [...resources].sort((a, b) => 
    `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)
  );
  
  for (const resource of sortedResources) {
    const result = acquireLock(resource.type, resource.id, lockOwner, timeoutMinutes);
    
    if (!result.success) {
      // Rollback: release all acquired locks
      for (const lock of acquiredLocks) {
        releaseLock(lock.resourceType, lock.resourceId, lockOwner);
      }
      return {
        success: false,
        error: `Failed to acquire lock on ${resource.type}:${resource.id}: ${result.error}`
      };
    }
    
    acquiredLocks.push(result.lock!);
  }
  
  return { success: true };
}

/**
 * Releases multiple locks
 */
export function releaseMultipleLocks(
  resources: Array<{ type: ResourceLock['resourceType']; id: UUID }>,
  lockOwner: string
): void {
  for (const resource of resources) {
    releaseLock(resource.type, resource.id, lockOwner);
  }
}

/**
 * Executes a function with a lock held
 * Automatically acquires and releases the lock
 */
export async function withLock<T>(
  resourceType: ResourceLock['resourceType'],
  resourceId: UUID,
  fn: () => Promise<T> | T,
  timeoutMinutes: number = DEFAULT_LOCK_TIMEOUT_MINUTES
): Promise<{ success: boolean; result?: T; error?: string }> {
  const lockOwner = uuidv4();
  
  const lockResult = acquireLock(resourceType, resourceId, lockOwner, timeoutMinutes);
  
  if (!lockResult.success) {
    return { success: false, error: lockResult.error };
  }
  
  try {
    const result = await fn();
    return { success: true, result };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  } finally {
    releaseLock(resourceType, resourceId, lockOwner);
  }
}

/**
 * Cleans up expired locks
 * Should be called periodically
 */
export function cleanupExpiredLocks(): number {
  const now = new Date();
  let cleaned = 0;
  
  for (const [key, lock] of locks.entries()) {
    const expiresAt = new Date(lock.expiresAt);
    if (expiresAt <= now) {
      locks.delete(key);
      cleaned++;
    }
  }
  
  return cleaned;
}

/**
 * Clears all locks (for testing)
 */
export function clearAllLocks(): void {
  locks.clear();
}

/**
 * Gets current lock count (for monitoring)
 */
export function getLockCount(): number {
  return locks.size;
}
