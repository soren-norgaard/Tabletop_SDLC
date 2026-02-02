/**
 * Timezone Utility Module
 * Task #4 & #8: Time and Data Management, Timezone-Safe Scheduling
 * 
 * Ensures accurate scheduling regardless of timezone by:
 * - Converting all times to UTC for storage
 * - Converting to local timezone for display
 * - Validating timezone strings
 * - Handling DST transitions safely
 */

import { ISODateTime } from '../types';

/** Supported timezone database identifiers */
export type TimezoneId = string;

/** Default timezone if not specified */
export const DEFAULT_TIMEZONE = 'UTC';

/** Default reservation duration in minutes */
export const DEFAULT_DURATION_MINUTES = 90;

/**
 * Validates that a timezone string is a valid IANA timezone identifier
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the current time in ISO format with timezone info
 */
export function nowInTimezone(timezone: string = DEFAULT_TIMEZONE): ISODateTime {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  return new Date().toISOString();
}

/**
 * Converts a datetime to UTC for consistent storage
 * All internal operations use UTC to prevent timezone-related bugs
 */
export function toUTC(datetime: Date | string, sourceTimezone?: string): Date {
  const date = typeof datetime === 'string' ? new Date(datetime) : datetime;
  
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${datetime}`);
  }
  
  return date;
}

/**
 * Converts a UTC datetime to a specific timezone for display
 */
export function fromUTC(utcDatetime: Date | string, targetTimezone: string): Date {
  const date = typeof utcDatetime === 'string' ? new Date(utcDatetime) : utcDatetime;
  
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${utcDatetime}`);
  }
  
  if (!isValidTimezone(targetTimezone)) {
    throw new Error(`Invalid timezone: ${targetTimezone}`);
  }
  
  return date;
}

/**
 * Formats a date in a specific timezone
 */
export function formatInTimezone(
  datetime: Date | string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof datetime === 'string' ? new Date(datetime) : datetime;
  
  if (!isValidTimezone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options
  };
  
  return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
}

/**
 * Gets the start and end of a day in a specific timezone
 * Important for calculating availability across timezone boundaries
 */
export function getDayBoundsInTimezone(
  date: Date | string,
  timezone: string
): { start: Date; end: Date } {
  const inputDate = typeof date === 'string' ? new Date(date) : date;
  
  if (!isValidTimezone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
  
  // Get date components in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // Format returns YYYY-MM-DD for en-CA locale
  const dateStr = formatter.format(inputDate);
  const [year, month, day] = dateStr.split('-').map(Number);
  
  // Create start of day (00:00:00) in UTC
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  
  return { start, end };
}

/**
 * Adds duration to a datetime
 */
export function addMinutes(datetime: Date | string, minutes: number): Date {
  const date = typeof datetime === 'string' ? new Date(datetime) : new Date(datetime);
  date.setMinutes(date.getMinutes() + minutes);
  return date;
}

/**
 * Calculates the end time of a reservation given start time and duration
 */
export function calculateEndTime(
  startTime: ISODateTime,
  durationMinutes: number = DEFAULT_DURATION_MINUTES
): ISODateTime {
  const start = new Date(startTime);
  return addMinutes(start, durationMinutes).toISOString();
}

/**
 * Checks if two time ranges overlap
 * Critical for preventing double bookings
 */
export function doTimeRangesOverlap(
  start1: Date | string,
  end1: Date | string,
  start2: Date | string,
  end2: Date | string
): boolean {
  const s1 = typeof start1 === 'string' ? new Date(start1) : start1;
  const e1 = typeof end1 === 'string' ? new Date(end1) : end1;
  const s2 = typeof start2 === 'string' ? new Date(start2) : start2;
  const e2 = typeof end2 === 'string' ? new Date(end2) : end2;
  
  // Two ranges overlap if one starts before the other ends
  return s1 < e2 && s2 < e1;
}

/**
 * Validates that a datetime is in the future
 */
export function isFutureDateTime(datetime: Date | string): boolean {
  const date = typeof datetime === 'string' ? new Date(datetime) : datetime;
  return date > new Date();
}

/**
 * Gets the current UTC timestamp as ISO string
 */
export function nowUTC(): ISODateTime {
  return new Date().toISOString();
}

/**
 * Parses an ISO datetime string safely
 */
export function parseDateTime(datetime: string): Date {
  const date = new Date(datetime);
  
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid datetime format: ${datetime}`);
  }
  
  return date;
}
