import 'server-only';

import type { CalendarTemplate } from '../types';
import { fetchCalendarBusyPeriods, type BusyPeriod } from './calendar-server';
import { getDelegatedGoogleAccessToken } from './google-service-account';

interface AvailabilityTarget {
  subject: string;
  calendarId: string;
}

function isWorkspaceUser(value: string) {
  return value.trim().toLowerCase().endsWith('@revrebel.io');
}

function availabilityTargets(page: CalendarTemplate): AvailabilityTarget[] {
  if (page.isUserTemplate) {
    if (!isWorkspaceUser(page.googleCalendarId)) return [];
    return [{
      subject: page.googleCalendarId.trim().toLowerCase(),
      calendarId: page.googleCalendarId.trim(),
    }];
  }

  const assignedUsers = page.assignedUsers
    .map((user) => user.googleCalendarId.trim().toLowerCase())
    .filter(isWorkspaceUser);
  const delegationSubject = assignedUsers[0];
  if (!delegationSubject) return [];

  const targets: AvailabilityTarget[] = assignedUsers.map((calendarId) => ({
    subject: calendarId,
    calendarId,
  }));
  if (page.googleCalendarId.trim()) {
    targets.push({
      subject: delegationSubject,
      calendarId: page.googleCalendarId.trim(),
    });
  }

  return [...new Map(
    targets.map((target) => [`${target.subject}\u0000${target.calendarId}`, target]),
  ).values()];
}

function mergeBusyPeriods(periods: BusyPeriod[]) {
  const normalized = periods
    .map((period) => ({
      start: new Date(period.start),
      end: new Date(period.end),
    }))
    .filter((period) => (
      Number.isFinite(period.start.getTime()) &&
      Number.isFinite(period.end.getTime()) &&
      period.end > period.start
    ))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: Array<{ start: Date; end: Date }> = [];
  for (const period of normalized) {
    const previous = merged.at(-1);
    if (previous && period.start <= previous.end) {
      if (period.end > previous.end) previous.end = period.end;
      continue;
    }
    merged.push(period);
  }

  return merged.map((period) => ({
    start: period.start.toISOString(),
    end: period.end.toISOString(),
  }));
}

export async function fetchBookingPageBusyPeriods({
  page,
  timeMin,
  timeMax,
  timeZone,
}: {
  page: CalendarTemplate;
  timeMin: string;
  timeMax: string;
  timeZone: string;
}) {
  const targets = availabilityTargets(page);
  if (targets.length === 0) {
    throw new Error('This booking page has no valid Workspace calendar assigned.');
  }

  const periods = await Promise.all(targets.map(async (target) => {
    const accessToken = await getDelegatedGoogleAccessToken(target.subject);
    return fetchCalendarBusyPeriods({
      accessToken,
      calendarId: target.calendarId,
      timeMin,
      timeMax,
      timeZone,
    });
  }));

  return mergeBusyPeriods(periods.flat());
}

export function busyPeriodsOverlap(
  periods: BusyPeriod[],
  start: Date,
  end: Date,
) {
  return periods.some((period) => (
    start < new Date(period.end) && end > new Date(period.start)
  ));
}
