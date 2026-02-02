/**
 * Tests for Timezone Utilities
 * Task #4: Time and Data Management
 * Task #8: Timezone-Safe Scheduling
 * 
 * Acceptance Criteria for Timezone-Safe Scheduling (Task #8):
 * - Given a reservation is created
 * - When the system processes the reservation time
 * - Then the time is handled correctly across different timezones
 */

import {
  isValidTimezone,
  nowInTimezone,
  toUTC,
  fromUTC,
  formatInTimezone,
  getDayBoundsInTimezone,
  addMinutes,
  calculateEndTime,
  doTimeRangesOverlap,
  isFutureDateTime,
  nowUTC,
  parseDateTime,
  DEFAULT_TIMEZONE,
  DEFAULT_DURATION_MINUTES
} from '../utils/timezone';

describe('Timezone Utilities', () => {
  describe('Task #8: Timezone-Safe Scheduling - Validation', () => {
    it('should validate correct timezone identifiers', () => {
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('Asia/Tokyo')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
    });

    it('should reject invalid timezone identifiers', () => {
      expect(isValidTimezone('Invalid/Timezone')).toBe(false);
      expect(isValidTimezone('Fake')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
    });
  });

  describe('Task #8: Timezone-Safe Scheduling - Time Conversion', () => {
    it('should convert datetime to UTC correctly', () => {
      const dateStr = '2025-06-15T14:00:00.000Z';
      const result = toUTC(dateStr);
      
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe(dateStr);
    });

    it('should throw error for invalid datetime', () => {
      expect(() => toUTC('not-a-date')).toThrow('Invalid datetime');
    });

    it('should convert UTC to timezone for display', () => {
      const utcDate = '2025-06-15T14:00:00.000Z';
      const result = fromUTC(utcDate, 'America/New_York');
      
      expect(result).toBeInstanceOf(Date);
    });

    it('should throw error for invalid timezone in fromUTC', () => {
      const utcDate = '2025-06-15T14:00:00.000Z';
      expect(() => fromUTC(utcDate, 'Invalid/TZ')).toThrow('Invalid timezone');
    });
  });

  describe('Task #8: Timezone-Safe Scheduling - Formatting', () => {
    it('should format datetime in specified timezone', () => {
      const date = new Date('2025-06-15T14:00:00.000Z');
      const formatted = formatInTimezone(date, 'UTC');
      
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
    });

    it('should throw error for invalid timezone in format', () => {
      const date = new Date();
      expect(() => formatInTimezone(date, 'Bad/TZ')).toThrow('Invalid timezone');
    });
  });

  describe('Task #4: Time and Data Management - Day Bounds', () => {
    it('should get correct day bounds for a timezone', () => {
      const date = new Date('2025-06-15T14:00:00.000Z');
      const bounds = getDayBoundsInTimezone(date, 'UTC');
      
      expect(bounds.start).toBeInstanceOf(Date);
      expect(bounds.end).toBeInstanceOf(Date);
      expect(bounds.end.getTime()).toBeGreaterThanOrEqual(bounds.start.getTime());
    });

    it('should throw error for invalid timezone in getDayBounds', () => {
      const date = new Date();
      expect(() => getDayBoundsInTimezone(date, 'Invalid')).toThrow('Invalid timezone');
    });
  });

  describe('Task #4: Time and Data Management - Duration Calculations', () => {
    it('should add minutes to a datetime', () => {
      const start = new Date('2025-06-15T14:00:00.000Z');
      const result = addMinutes(start, 30);
      
      expect(result.getTime() - start.getTime()).toBe(30 * 60 * 1000);
    });

    it('should calculate end time from start and duration', () => {
      const startTime = '2025-06-15T14:00:00.000Z';
      const endTime = calculateEndTime(startTime, 90);
      
      const start = new Date(startTime);
      const end = new Date(endTime);
      
      expect(end.getTime() - start.getTime()).toBe(90 * 60 * 1000);
    });

    it('should use default duration if not specified', () => {
      const startTime = '2025-06-15T14:00:00.000Z';
      const endTime = calculateEndTime(startTime);
      
      const start = new Date(startTime);
      const end = new Date(endTime);
      
      expect(end.getTime() - start.getTime()).toBe(DEFAULT_DURATION_MINUTES * 60 * 1000);
    });
  });

  describe('Task #4: Time and Data Management - Time Range Overlap', () => {
    it('should detect overlapping time ranges', () => {
      // Range 1: 14:00 - 15:30
      // Range 2: 15:00 - 16:30 (overlaps)
      const start1 = '2025-06-15T14:00:00.000Z';
      const end1 = '2025-06-15T15:30:00.000Z';
      const start2 = '2025-06-15T15:00:00.000Z';
      const end2 = '2025-06-15T16:30:00.000Z';
      
      expect(doTimeRangesOverlap(start1, end1, start2, end2)).toBe(true);
    });

    it('should detect non-overlapping time ranges', () => {
      // Range 1: 14:00 - 15:00
      // Range 2: 15:30 - 17:00 (no overlap)
      const start1 = '2025-06-15T14:00:00.000Z';
      const end1 = '2025-06-15T15:00:00.000Z';
      const start2 = '2025-06-15T15:30:00.000Z';
      const end2 = '2025-06-15T17:00:00.000Z';
      
      expect(doTimeRangesOverlap(start1, end1, start2, end2)).toBe(false);
    });

    it('should handle adjacent time ranges (no overlap)', () => {
      // Range 1: 14:00 - 15:00
      // Range 2: 15:00 - 16:00 (adjacent, no overlap)
      const start1 = '2025-06-15T14:00:00.000Z';
      const end1 = '2025-06-15T15:00:00.000Z';
      const start2 = '2025-06-15T15:00:00.000Z';
      const end2 = '2025-06-15T16:00:00.000Z';
      
      expect(doTimeRangesOverlap(start1, end1, start2, end2)).toBe(false);
    });
  });

  describe('Task #4: Time and Data Management - Future Time Validation', () => {
    it('should identify future datetime', () => {
      const future = new Date(Date.now() + 3600000); // 1 hour from now
      expect(isFutureDateTime(future)).toBe(true);
    });

    it('should identify past datetime', () => {
      const past = new Date(Date.now() - 3600000); // 1 hour ago
      expect(isFutureDateTime(past)).toBe(false);
    });

    it('should work with ISO string input', () => {
      const future = new Date(Date.now() + 3600000).toISOString();
      expect(isFutureDateTime(future)).toBe(true);
    });
  });

  describe('Task #4: Time and Data Management - UTC Operations', () => {
    it('should return current UTC timestamp', () => {
      const utc = nowUTC();
      
      expect(typeof utc).toBe('string');
      expect(utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should parse valid datetime strings', () => {
      const dateStr = '2025-06-15T14:00:00.000Z';
      const parsed = parseDateTime(dateStr);
      
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.toISOString()).toBe(dateStr);
    });

    it('should throw error for invalid datetime strings', () => {
      expect(() => parseDateTime('not-a-date')).toThrow('Invalid datetime format');
    });
  });

  describe('Task #8: Timezone Handling Across Regions', () => {
    it('should handle reservations in different timezones consistently', () => {
      // Create a reservation time in New York
      const nyTime = '2025-06-15T19:00:00.000Z'; // 3 PM ET (7 PM UTC)
      
      // The same moment in Tokyo
      const tokyoFormatted = formatInTimezone(nyTime, 'Asia/Tokyo');
      const nyFormatted = formatInTimezone(nyTime, 'America/New_York');
      
      // Both should represent the same moment in time
      expect(tokyoFormatted).toBeDefined();
      expect(nyFormatted).toBeDefined();
      
      // The underlying UTC time should be identical
      const nyDate = new Date(nyTime);
      const tokyoDate = fromUTC(nyTime, 'Asia/Tokyo');
      
      expect(nyDate.getTime()).toBe(tokyoDate.getTime());
    });
  });
});
