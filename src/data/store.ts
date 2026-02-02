/**
 * In-Memory Data Store
 * Task #4: Time and Data Management
 * 
 * Provides data persistence with:
 * - Type-safe CRUD operations
 * - Optimistic locking via version field
 * - Efficient lookups and filtering
 */

import { v4 as uuidv4 } from 'uuid';
import { 
  UUID, 
  Customer, 
  Table, 
  Waiter, 
  Reservation, 
  TableStatus, 
  WaiterStatus,
  ReservationStatus,
  ISODateTime
} from '../types';
import { nowUTC } from '../utils/timezone';

/** Generic store interface */
interface Store<T extends { id: UUID }> {
  getById(id: UUID): T | undefined;
  getAll(): T[];
  create(item: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T;
  update(id: UUID, updates: Partial<T>): T | undefined;
  delete(id: UUID): boolean;
}

/** Base data store with common functionality */
abstract class BaseStore<T extends { id: UUID; createdAt: ISODateTime; updatedAt: ISODateTime }> implements Store<T> {
  protected items: Map<UUID, T> = new Map();

  getById(id: UUID): T | undefined {
    return this.items.get(id);
  }

  getAll(): T[] {
    return Array.from(this.items.values());
  }

  protected abstract createItem(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T;

  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): T {
    const item = this.createItem(data);
    this.items.set(item.id, item);
    return item;
  }

  update(id: UUID, updates: Partial<T>): T | undefined {
    const existing = this.items.get(id);
    if (!existing) {
      return undefined;
    }

    const updated = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID change
      createdAt: existing.createdAt, // Prevent createdAt change
      updatedAt: nowUTC()
    } as T;

    this.items.set(id, updated);
    return updated;
  }

  delete(id: UUID): boolean {
    return this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }

  count(): number {
    return this.items.size;
  }
}

/** Customer data store */
class CustomerStore extends BaseStore<Customer> {
  protected createItem(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Customer {
    const now = nowUTC();
    return {
      ...data,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now
    };
  }

  findByName(name: string): Customer[] {
    return this.getAll().filter(c => 
      c.name.toLowerCase().includes(name.toLowerCase())
    );
  }

  findByPhone(phone: string): Customer | undefined {
    return this.getAll().find(c => c.phone === phone);
  }

  findByEmail(email: string): Customer | undefined {
    return this.getAll().find(c => c.email === email);
  }
}

/** Table data store */
class TableStore extends BaseStore<Table> {
  protected createItem(data: Omit<Table, 'id' | 'createdAt' | 'updatedAt'>): Table {
    const now = nowUTC();
    return {
      ...data,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now
    };
  }

  findByStatus(status: TableStatus): Table[] {
    return this.getAll().filter(t => t.status === status);
  }

  findAvailable(): Table[] {
    return this.findByStatus(TableStatus.AVAILABLE);
  }

  findByCapacity(minCapacity: number): Table[] {
    return this.getAll().filter(t => t.capacity >= minCapacity);
  }

  findAvailableForPartySize(partySize: number): Table[] {
    return this.getAll().filter(t => 
      t.status === TableStatus.AVAILABLE && 
      t.capacity >= partySize
    );
  }

  findByNumber(tableNumber: number): Table | undefined {
    return this.getAll().find(t => t.number === tableNumber);
  }
}

/** Waiter data store */
class WaiterStore extends BaseStore<Waiter> {
  protected createItem(data: Omit<Waiter, 'id' | 'createdAt' | 'updatedAt'>): Waiter {
    const now = nowUTC();
    return {
      ...data,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now
    };
  }

  findByStatus(status: WaiterStatus): Waiter[] {
    return this.getAll().filter(w => w.status === status);
  }

  findAvailable(): Waiter[] {
    return this.findByStatus(WaiterStatus.AVAILABLE);
  }

  findWithLeastTables(): Waiter | undefined {
    const available = this.findAvailable();
    if (available.length === 0) {
      // If no available waiters, try busy ones
      const busy = this.findByStatus(WaiterStatus.BUSY);
      if (busy.length === 0) return undefined;
      return busy.reduce((min, w) => 
        w.assignedTables.length < min.assignedTables.length ? w : min
      );
    }
    return available.reduce((min, w) => 
      w.assignedTables.length < min.assignedTables.length ? w : min
    );
  }

  assignTable(waiterId: UUID, tableId: UUID): boolean {
    const waiter = this.getById(waiterId);
    if (!waiter) return false;
    
    if (!waiter.assignedTables.includes(tableId)) {
      this.update(waiterId, {
        assignedTables: [...waiter.assignedTables, tableId],
        status: WaiterStatus.BUSY
      });
    }
    return true;
  }

  unassignTable(waiterId: UUID, tableId: UUID): boolean {
    const waiter = this.getById(waiterId);
    if (!waiter) return false;
    
    const newTables = waiter.assignedTables.filter(t => t !== tableId);
    this.update(waiterId, {
      assignedTables: newTables,
      status: newTables.length === 0 ? WaiterStatus.AVAILABLE : WaiterStatus.BUSY
    });
    return true;
  }
}

/** Reservation data store with optimistic locking */
class ReservationStore extends BaseStore<Reservation> {
  protected createItem(data: Omit<Reservation, 'id' | 'createdAt' | 'updatedAt'>): Reservation {
    const now = nowUTC();
    return {
      ...data,
      id: uuidv4(),
      version: 1,
      createdAt: now,
      updatedAt: now
    } as Reservation;
  }

  /**
   * Update with optimistic locking
   * Prevents race conditions by checking version before update
   */
  updateWithVersion(id: UUID, updates: Partial<Reservation>, expectedVersion: number): Reservation | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    if (existing.version !== expectedVersion) {
      // Version mismatch - concurrent modification detected
      return null;
    }

    const updated = this.update(id, {
      ...updates,
      version: existing.version + 1
    });

    return updated || null;
  }

  findByStatus(status: ReservationStatus): Reservation[] {
    return this.getAll().filter(r => r.status === status);
  }

  findByCustomerId(customerId: UUID): Reservation[] {
    return this.getAll().filter(r => r.customerId === customerId);
  }

  findByTableId(tableId: UUID): Reservation[] {
    return this.getAll().filter(r => r.tableId === tableId);
  }

  findByTimeRange(startTime: Date, endTime: Date): Reservation[] {
    return this.getAll().filter(r => {
      const rStart = new Date(r.startTime);
      const rEnd = new Date(r.endTime);
      return rStart < endTime && rEnd > startTime;
    });
  }

  findActiveByTable(tableId: UUID): Reservation | undefined {
    const activeStatuses = [
      ReservationStatus.PENDING, 
      ReservationStatus.CONFIRMED, 
      ReservationStatus.SEATED
    ];
    return this.getAll().find(r => 
      r.tableId === tableId && activeStatuses.includes(r.status)
    );
  }

  findUpcoming(hours: number = 24): Reservation[] {
    const now = new Date();
    const future = new Date(now.getTime() + hours * 60 * 60 * 1000);
    
    return this.getAll().filter(r => {
      const rStart = new Date(r.startTime);
      return rStart >= now && rStart <= future && 
        r.status !== ReservationStatus.CANCELLED &&
        r.status !== ReservationStatus.COMPLETED;
    });
  }

  findWalkIns(): Reservation[] {
    return this.getAll().filter(r => r.isWalkIn);
  }

  findByDate(date: Date): Reservation[] {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return this.findByTimeRange(dayStart, dayEnd);
  }
}

/** Singleton instances */
export const customerStore = new CustomerStore();
export const tableStore = new TableStore();
export const waiterStore = new WaiterStore();
export const reservationStore = new ReservationStore();

/** Initialize with sample data (for development/testing) */
export function initializeSampleData(): void {
  // Clear existing data
  customerStore.clear();
  tableStore.clear();
  waiterStore.clear();
  reservationStore.clear();

  // Add sample tables
  for (let i = 1; i <= 10; i++) {
    tableStore.create({
      number: i,
      capacity: i <= 4 ? 2 : i <= 7 ? 4 : 6,
      status: TableStatus.AVAILABLE,
      section: i <= 5 ? 'Main' : 'Patio'
    });
  }

  // Add sample waiters
  const waiterNames = ['Alice', 'Bob', 'Charlie', 'Diana'];
  for (const name of waiterNames) {
    waiterStore.create({
      name,
      status: WaiterStatus.AVAILABLE,
      assignedTables: []
    });
  }
}

/** Reset all stores (for testing) */
export function resetStores(): void {
  customerStore.clear();
  tableStore.clear();
  waiterStore.clear();
  reservationStore.clear();
}
