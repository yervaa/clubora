"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClubColorDot } from "@/components/ui/club-color-dot";
import { EmptyState } from "@/components/ui/empty-state";
import { getClubAccentColor } from "@/lib/clubs/club-visual";

export type DashboardCalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  club_name: string;
  club_id?: string;
};

type DashboardCalendarProps = {
  events: DashboardCalendarEvent[];
  today: Date;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 6l-6 6l6 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 6l6 6l-6 6" />
    </svg>
  );
}

export function DashboardCalendar({ events, today }: DashboardCalendarProps) {
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const eventsByDay = useMemo(() => {
    const map = new Map<string, DashboardCalendarEvent[]>();
    for (const event of events) {
      const date = new Date(event.starts_at);
      if (Number.isNaN(date.getTime())) continue;
      const key = dayKey(date);
      const existing = map.get(key);
      if (existing) existing.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [events]);

  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const lastOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const startDay = firstOfMonth.getDay();
    const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    for (let i = startDay - 1; i >= 0; i -= 1) {
      days.push({ date: new Date(viewYear, viewMonth, -i), isCurrentMonth: false });
    }
    for (let d = 1; d <= lastOfMonth.getDate(); d += 1) {
      days.push({ date: new Date(viewYear, viewMonth, d), isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d += 1) {
      days.push({ date: new Date(viewYear, viewMonth + 1, d), isCurrentMonth: false });
    }
    return days;
  }, [viewYear, viewMonth]);

  const upcomingEvents = useMemo(() => {
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return [...events]
      .filter((event) => {
        const t = new Date(event.starts_at).getTime();
        return !Number.isNaN(t) && t >= startOfToday;
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, 3);
  }, [events, today]);

  function goPrev() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goNext() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={goPrev}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft />
        </button>
        <span className="text-[13px] font-medium text-gray-800">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={goNext}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1" aria-hidden>
        {WEEKDAYS.map((day) => (
          <span key={day} className="text-center text-[11px] text-gray-400 py-1 tracking-wide">
            {day}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {calendarDays.map(({ date, isCurrentMonth }) => {
          const dayEvents = isCurrentMonth ? eventsByDay.get(dayKey(date)) ?? [] : [];
          const isToday = sameDay(date, today);
          const dotColor = dayEvents[0] ? getClubAccentColor(dayEvents[0].club_name) : null;

          let dateClasses = "text-[12px] w-7 h-7 flex items-center justify-center rounded-full";
          if (isToday) {
            dateClasses += " bg-[#12122a] text-white";
          } else if (isCurrentMonth) {
            dateClasses += " text-gray-700";
          } else {
            dateClasses += " opacity-30";
          }

          return (
            <div key={dayKey(date)} className="flex flex-col items-center justify-start min-h-[32px] py-0.5">
              <span className={dateClasses}>{date.getDate()}</span>
              {dotColor ? (
                <div
                  className="mt-0.5 h-[5px] w-[5px] rounded-full"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-100 mt-3 pt-3">
        {upcomingEvents.length === 0 ? (
          <EmptyState
            icon="ti-calendar-event"
            title="No events yet"
            description="No upcoming events from your clubs."
            embedded
          />
        ) : (
          <ul role="list">
            {upcomingEvents.map((event) => {
              const dateLabel = new Date(event.starts_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              });
              const row = (
                <>
                  <ClubColorDot clubName={event.club_name} size="sm" />
                  <span className="text-[12px] text-gray-700 flex-1 truncate">{event.title}</span>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">{dateLabel}</span>
                </>
              );
              return (
                <li key={event.id}>
                  {event.club_id ? (
                    <Link href={`/clubs/${event.club_id}/events`} className="flex items-center gap-2 py-1.5">
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 py-1.5">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/events" className="text-[11px] text-gray-400 hover:text-gray-600 float-right mt-2">
          View all
        </Link>
      </div>
    </div>
  );
}
