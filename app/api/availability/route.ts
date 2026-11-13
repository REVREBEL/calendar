import { NextRequest, NextResponse } from 'next/server';
import { fetchBookingPageBusyPeriods } from '@/src/lib/availability-server';
import { listBookingPages, WebflowConfigurationError } from '@/src/lib/webflow-server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const calendarSlug = request.nextUrl.searchParams.get('calendar')?.trim().toLowerCase() || '';
  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (!/^[a-z0-9-]+$/.test(calendarSlug) || !fromDate || !toDate ||
    !Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime()) ||
    toDate <= fromDate || toDate.getTime() - fromDate.getTime() > 120 * 24 * 60 * 60_000) {
    return NextResponse.json(
      { error: 'A valid calendar, from, and to range of at most 120 days is required.' },
      { status: 400 },
    );
  }

  try {
    const pages = await listBookingPages(true);
    const page = pages.find((candidate) => candidate.slug === calendarSlug);
    if (!page) {
      return NextResponse.json({ error: 'That booking calendar was not found.' }, { status: 404 });
    }

    const busy = await fetchBookingPageBusyPeriods({
      page,
      timeMin: fromDate.toISOString(),
      timeMax: toDate.toISOString(),
      timeZone: 'America/Los_Angeles',
    });
    return NextResponse.json({
      calendar: calendarSlug,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      busy,
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('[availability] Unable to load live Google availability.', error);
    return NextResponse.json({
      error: error instanceof WebflowConfigurationError
        ? 'Booking storage is not configured.'
        : 'Live calendar availability is temporarily unavailable.',
    }, { status: 503 });
  }
}
