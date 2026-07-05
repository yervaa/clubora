"use client";

import { useFormStatus } from "react-dom";
import { deleteEventAction, deleteEventSeriesAction, updateEventAction } from "@/app/(app)/clubs/actions";
import { EVENT_TYPE_OPTIONS } from "@/lib/events";

type EventManagementControlsProps = {
  clubId: string;
  eventId: string;
  title: string;
  description: string;
  location: string;
  eventType: string;
  capacity: number | null;
  eventDateIso: string;
  seriesId: string | null;
  seriesOccurrence: number | null;
  canEditEvents: boolean;
  canDeleteEvents: boolean;
};

function toDatetimeLocalValue(eventDateIso: string) {
  const parsed = new Date(eventDateIso);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function SaveEventButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary min-h-10 text-xs" disabled={pending}>
      {pending ? "Saving..." : "Save changes"}
    </button>
  );
}

function DeleteEventButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-danger min-h-10 text-xs"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm("Delete this event? This will remove linked RSVPs, attendance, and reflections.")) {
          event.preventDefault();
        }
      }}
    >
      {pending ? "Deleting..." : "Delete event"}
    </button>
  );
}

function DeleteSeriesButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-danger min-h-10 text-xs"
      disabled={pending}
      onClick={(event) => {
        if (
          !window.confirm(
            "Delete this entire recurring series? This will remove every occurrence and all linked RSVPs, attendance, and reflections.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      {pending ? "Deleting series..." : "Delete entire series"}
    </button>
  );
}

export function EventManagementControls({
  clubId,
  eventId,
  title,
  description,
  location,
  eventType,
  capacity,
  eventDateIso,
  seriesId,
  seriesOccurrence,
  canEditEvents,
  canDeleteEvents,
}: EventManagementControlsProps) {
  const dateValue = toDatetimeLocalValue(eventDateIso);

  if (!canEditEvents && !canDeleteEvents) {
    return null;
  }

  return (
    <div className="space-y-4 border-t border-slate-200 pt-4">
      {canEditEvents ? (
        <details className="rounded-xl border border-slate-200 bg-slate-50/70">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
            Edit event{seriesId ? " (this occurrence only)" : ""}
          </summary>
          <form action={updateEventAction} className="space-y-3 border-t border-slate-200 px-4 py-4">
            <input type="hidden" name="club_id" value={clubId} />
            <input type="hidden" name="event_id" value={eventId} />
            <div>
              <label htmlFor={`event_title_edit_${eventId}`} className="mb-1.5 block text-xs font-medium text-slate-700">
                Title
              </label>
              <input
                id={`event_title_edit_${eventId}`}
                name="title"
                type="text"
                required
                minLength={3}
                maxLength={160}
                defaultValue={title}
                className="input-control min-h-10"
              />
            </div>
            <div>
              <label htmlFor={`event_date_edit_${eventId}`} className="mb-1.5 block text-xs font-medium text-slate-700">
                Date and time
              </label>
              <input
                id={`event_date_edit_${eventId}`}
                name="event_date"
                type="datetime-local"
                required
                defaultValue={dateValue}
                className="input-control min-h-10"
              />
            </div>
            <div>
              <label htmlFor={`event_type_edit_${eventId}`} className="mb-1.5 block text-xs font-medium text-slate-700">
                Event type
              </label>
              <select
                id={`event_type_edit_${eventId}`}
                name="event_type"
                className="input-control min-h-10"
                defaultValue={EVENT_TYPE_OPTIONS.includes(eventType as (typeof EVENT_TYPE_OPTIONS)[number]) ? eventType : "Other"}
              >
                {EVENT_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`event_capacity_edit_${eventId}`} className="mb-1.5 block text-xs font-medium text-slate-700">
                Capacity (optional)
              </label>
              <input
                id={`event_capacity_edit_${eventId}`}
                name="capacity"
                type="number"
                min={1}
                max={5000}
                defaultValue={capacity ?? ""}
                className="input-control min-h-10"
                placeholder="Leave blank for unlimited"
              />
            </div>
            <div>
              <label htmlFor={`event_location_edit_${eventId}`} className="mb-1.5 block text-xs font-medium text-slate-700">
                Location
              </label>
              <input
                id={`event_location_edit_${eventId}`}
                name="location"
                type="text"
                maxLength={160}
                defaultValue={location}
                className="input-control min-h-10"
              />
            </div>
            <div>
              <label htmlFor={`event_description_edit_${eventId}`} className="mb-1.5 block text-xs font-medium text-slate-700">
                Description
              </label>
              <textarea
                id={`event_description_edit_${eventId}`}
                name="description"
                rows={3}
                maxLength={2000}
                defaultValue={description}
                className="textarea-control"
              />
            </div>
            {seriesId ? (
              <p className="text-xs text-slate-600">
                This edit affects only occurrence {seriesOccurrence ?? "?"} in the recurring series.
              </p>
            ) : null}
            <SaveEventButton />
          </form>
        </details>
      ) : null}

      {canDeleteEvents ? (
        <div className="space-y-3">
          <form action={deleteEventAction} className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3">
            <input type="hidden" name="club_id" value={clubId} />
            <input type="hidden" name="event_id" value={eventId} />
            <p className="text-xs text-red-900">
              This permanently removes this occurrence and linked RSVPs, attendance records, and reflections.
            </p>
            <div className="mt-3">
              <DeleteEventButton />
            </div>
          </form>

          {seriesId ? (
            <form action={deleteEventSeriesAction} className="rounded-xl border border-red-200 bg-red-100/70 px-4 py-3">
              <input type="hidden" name="club_id" value={clubId} />
              <input type="hidden" name="event_id" value={eventId} />
              <p className="text-xs text-red-900">
                Delete all occurrences in this recurring series, including linked RSVPs, attendance records, and reflections.
              </p>
              <div className="mt-3">
                <DeleteSeriesButton />
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
