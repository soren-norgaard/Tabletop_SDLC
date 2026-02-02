/**
 * HTTP Server for Restaurant Reservation System
 * Runs on port 3080
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import {
  createReservation,
  getReservation,
  getReservations,
  updateReservationStatus,
  cancelReservation,
  checkAvailability,
  getUpcomingReservations,
  getTodaysReservations
} from './services/reservationService';
import {
  handleWalkIn,
  canAccommodateWalkIn,
  getCurrentWalkIns,
  getWalkInStats,
  getEstimatedWaitTime
} from './services/walkInService';
import {
  getAvailableSlots,
  getNextAvailableSlot,
  getAvailabilitySummary
} from './services/availabilityService';
import { tableStore, waiterStore, initializeSampleData } from './data/store';
import { ReservationStatus } from './types';

const app = express();
const PORT = 3080;

// Middleware
app.use(express.json());

// Serve static files (Web UI)
app.use(express.static(path.join(__dirname, '../public')));

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', port: PORT });
});

// ============== RESERVATION ENDPOINTS ==============

// Create a reservation
app.post('/api/v1/reservations', async (req, res) => {
  try {
    const result = await createReservation(req.body);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create reservation' }
    });
  }
});

// Get all reservations
app.get('/api/v1/reservations', (req, res) => {
  const { status, date, tableId, customerId } = req.query;
  
  const filters: any = {};
  if (status) filters.status = status as ReservationStatus;
  if (date) filters.date = new Date(date as string);
  if (tableId) filters.tableId = tableId as string;
  if (customerId) filters.customerId = customerId as string;

  const reservations = getReservations(Object.keys(filters).length > 0 ? filters : undefined);
  res.json({ success: true, data: reservations });
});

// Get upcoming reservations
app.get('/api/v1/reservations/upcoming', (req, res) => {
  const hours = req.query.hours ? parseInt(req.query.hours as string) : 24;
  const reservations = getUpcomingReservations(hours);
  res.json({ success: true, data: reservations });
});

// Get today's reservations
app.get('/api/v1/reservations/today', (req, res) => {
  const reservations = getTodaysReservations();
  res.json({ success: true, data: reservations });
});

// Get a specific reservation
app.get('/api/v1/reservations/:id', (req, res) => {
  const result = getReservation(req.params.id);
  if (result.success) {
    res.json(result);
  } else {
    res.status(404).json(result);
  }
});

// Update reservation status
app.patch('/api/v1/reservations/:id/status', (req, res) => {
  const { status, version } = req.body;
  
  if (!status || version === undefined) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'status and version are required' }
    });
  }

  const result = updateReservationStatus(req.params.id, status, version);
  if (result.success) {
    res.json(result);
  } else {
    res.status(result.error?.code === 'RESERVATION_NOT_FOUND' ? 404 : 409).json(result);
  }
});

// Cancel a reservation
app.delete('/api/v1/reservations/:id', (req, res) => {
  const { version } = req.body;
  
  if (version === undefined) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'version is required for cancellation' }
    });
  }

  const result = cancelReservation(req.params.id, version);
  if (result.success) {
    res.json(result);
  } else {
    res.status(result.error?.code === 'RESERVATION_NOT_FOUND' ? 404 : 409).json(result);
  }
});

// ============== WALK-IN ENDPOINTS ==============

// Handle a walk-in
app.post('/api/v1/walk-ins', async (req, res) => {
  try {
    const result = await handleWalkIn(req.body);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to process walk-in' }
    });
  }
});

// Check if walk-in can be accommodated
app.get('/api/v1/walk-ins/check', (req, res) => {
  const partySize = parseInt(req.query.partySize as string);
  
  if (isNaN(partySize)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'partySize is required' }
    });
  }

  const result = canAccommodateWalkIn(partySize);
  res.json(result);
});

// Get current walk-ins
app.get('/api/v1/walk-ins/current', (req, res) => {
  const walkIns = getCurrentWalkIns();
  res.json({ success: true, data: walkIns });
});

// Get walk-in statistics
app.get('/api/v1/walk-ins/stats', (req, res) => {
  const stats = getWalkInStats();
  res.json({ success: true, data: stats });
});

// Get estimated wait time
app.get('/api/v1/walk-ins/wait-time', (req, res) => {
  const partySize = parseInt(req.query.partySize as string);
  
  if (isNaN(partySize)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'partySize is required' }
    });
  }

  const result = getEstimatedWaitTime(partySize);
  res.json(result);
});

// ============== AVAILABILITY ENDPOINTS ==============

// Check availability for a time slot
app.post('/api/v1/availability/check', (req, res) => {
  const result = checkAvailability(req.body);
  res.json(result);
});

// Get available slots for a date
app.get('/api/v1/availability/slots', (req, res) => {
  const { date, partySize, timezone, duration } = req.query;
  
  if (!date || !partySize) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'date and partySize are required' }
    });
  }

  const result = getAvailableSlots(
    date as string,
    parseInt(partySize as string),
    timezone as string,
    duration ? parseInt(duration as string) : undefined
  );
  res.json(result);
});

// Get next available slot
app.get('/api/v1/availability/next', (req, res) => {
  const partySize = parseInt(req.query.partySize as string);
  const fromTime = req.query.fromTime as string;
  const duration = req.query.duration ? parseInt(req.query.duration as string) : undefined;
  
  if (isNaN(partySize)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'partySize is required' }
    });
  }

  const result = getNextAvailableSlot(partySize, fromTime, duration);
  res.json(result);
});

// Get availability summary
app.get('/api/v1/availability/summary', (req, res) => {
  const { date, timezone } = req.query;
  
  if (!date) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'date is required' }
    });
  }

  const result = getAvailabilitySummary(date as string, timezone as string);
  res.json(result);
});

// ============== TABLE ENDPOINTS ==============

// Get all tables
app.get('/api/v1/tables', (req, res) => {
  const tables = tableStore.getAll();
  res.json({ success: true, data: tables });
});

// Get available tables
app.get('/api/v1/tables/available', (req, res) => {
  const tables = tableStore.findAvailable();
  res.json({ success: true, data: tables });
});

// ============== WAITER ENDPOINTS ==============

// Get all waiters
app.get('/api/v1/waiters', (req, res) => {
  const waiters = waiterStore.getAll();
  res.json({ success: true, data: waiters });
});

// Get available waiters
app.get('/api/v1/waiters/available', (req, res) => {
  const waiters = waiterStore.findAvailable();
  res.json({ success: true, data: waiters });
});

// Initialize sample data
initializeSampleData();

// Start server
app.listen(PORT, () => {
  console.log(`🍽️  Restaurant Reservation System running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 API base: http://localhost:${PORT}/api/v1`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  POST   /api/v1/reservations          - Create reservation');
  console.log('  GET    /api/v1/reservations          - List reservations');
  console.log('  GET    /api/v1/reservations/:id      - Get reservation');
  console.log('  PATCH  /api/v1/reservations/:id/status - Update status');
  console.log('  DELETE /api/v1/reservations/:id      - Cancel reservation');
  console.log('  POST   /api/v1/walk-ins              - Handle walk-in');
  console.log('  GET    /api/v1/walk-ins/check        - Check walk-in availability');
  console.log('  GET    /api/v1/availability/slots    - Get available slots');
  console.log('  GET    /api/v1/tables                - List tables');
});

export default app;
