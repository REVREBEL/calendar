export interface BusyPeriod {
  start: string;
  end: string;
}

interface FreeBusyResponse {
  calendars?: Record<string, {
    busy?: BusyPeriod[];
    errors?: Array<{ domain?: string; reason?: string }>;
  }>;
}

export async function fetchCalendarBusyPeriods({
  accessToken,
  calendarId = 'primary',
  timeMin,
  timeMax,
  timeZone,
}: {
  accessToken: string;
  calendarId?: string;
  timeMin: string;
  timeMax: string;
  timeZone: string;
}): Promise<BusyPeriod[]> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone,
      items: [{ id: calendarId }],
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Google Calendar FreeBusy request failed with ${response.status}.`);
  }

  const result = await response.json() as FreeBusyResponse;
  const calendar = result.calendars?.[calendarId];
  if (!calendar || calendar.errors?.length) {
    throw new Error('Google Calendar could not return availability for a required calendar.');
  }
  return calendar.busy ?? [];
}
