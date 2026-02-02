/**
 * Restaurant Reservation Management System
 * 
 * This system implements the following tasks:
 * - Task #1: Reservation Management - Manage reservations, prevent double bookings, calculate availability
 * - Task #2: Walk-in Support - Support walk-in guests with availability checking and table assignment
 * - Task #3: System Reliability and Usability - Race condition prevention, error handling
 * - Task #4: Time and Data Management - Timezone-safe handling, data persistence
 * - Task #5: Create Reservation - Create reservations with customer details, availability check
 * - Task #6: Handle Walk-ins - Check availability and confirm walk-ins
 * - Task #7: Prevent Race Conditions - Safe concurrent request handling
 * - Task #8: Timezone-Safe Scheduling - Accurate scheduling across timezones
 */

export * from './types';
export * from './utils';
export * from './data';
export * from './services';

import { initializeSampleData } from './data';

// Initialize sample data on load
initializeSampleData();

console.log('Restaurant Reservation System initialized');
console.log('Available exports:');
console.log('- Types: Reservation, Customer, Table, Waiter, etc.');
console.log('- Services: createReservation, handleWalkIn, checkAvailability');
console.log('- Utils: timezone helpers, locking utilities');
