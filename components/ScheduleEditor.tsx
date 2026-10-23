import { useEffect, useState } from "preact/hooks";
import type { ScheduleSlot } from "@/src/domain/commerce.ts";
import { fillSchedule, type SchedulePattern } from "@/src/domain/schedule.ts";
function defaults(slots: ScheduleSlot[]): SchedulePattern {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
  return {
    title: slots[0]?.title || "Consultation",
    bookingUrl: slots[0]?.bookingUrl || "",
    startDate: local,
    weeks: 1,
    days: [1, 2, 3, 4, 5],
    opens: "09:00",
    closes: "17:00",
    duration: 60,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
}
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export default function ScheduleEditor(
  { slots, onChange, onPending }: {
    slots: ScheduleSlot[];
    onChange: (slots: ScheduleSlot[]) => void;
    onPending: (pending: boolean) => void;
  },
) {
  const [pattern, setPattern] = useState(() => defaults(slots)),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    onPending(dirty);
    return () => onPending(false);
  }, [dirty]);
  const edit = (patch: Partial<SchedulePattern>) => {
    setPattern({ ...pattern, ...patch });
    setDirty(true);
    setMessage("");
  };
  let preview: ScheduleSlot[] | undefined, problem = "";
  try {
    preview = fillSchedule(pattern, slots);
  } catch (e) {
    problem = e instanceof Error ? e.message : "Check your schedule.";
  }
  const zones = [
    ...new Set([
      pattern.timeZone,
      "America/Chicago",
      "America/New_York",
      "America/Denver",
      "America/Los_Angeles",
      "Europe/London",
      "Europe/Paris",
      "Asia/Tokyo",
      "Australia/Sydney",
      "UTC",
    ]),
  ];
  return (
    <section class="schedule-editor">
      <h3>Schedule</h3>
      <p>Choose your usual hours, then fill your calendar in one step.</p>
      <label>
        Session name<input
          value={pattern.title}
          maxLength={200}
          onInput={(e) => edit({ title: e.currentTarget.value })}
        />
      </label>
      <label>
        Booking link<input
          type="url"
          value={pattern.bookingUrl}
          placeholder="https://your-booking-service.com/your-page"
          onInput={(e) => edit({ bookingUrl: e.currentTarget.value })}
        />
      </label>
      <fieldset>
        <legend>Available days</legend>
        <div class="settings-buttons">
          {DAYS.map((day, i) => (
            <label class="inline-check" key={day}>
              <input
                type="checkbox"
                checked={pattern.days.includes(i)}
                onChange={(e) =>
                  edit({
                    days: e.currentTarget.checked
                      ? [...pattern.days, i]
                      : pattern.days.filter((d) => d !== i),
                  })}
              />
              {day}
            </label>
          ))}
        </div>
        <div class="settings-buttons">
          <button
            type="button"
            class="button"
            onClick={() => edit({ days: [1, 2, 3, 4, 5] })}
          >
            Weekdays
          </button>
          <button
            type="button"
            class="button"
            onClick={() => edit({ days: [0, 6] })}
          >
            Weekends
          </button>
          <button
            type="button"
            class="button"
            onClick={() => edit({ days: [0, 1, 2, 3, 4, 5, 6] })}
          >
            Every day
          </button>
        </div>
      </fieldset>
      <div class="settings-buttons">
        <label>
          From<input
            type="time"
            value={pattern.opens}
            onInput={(e) => edit({ opens: e.currentTarget.value })}
          />
        </label>
        <label>
          Until<input
            type="time"
            value={pattern.closes}
            onInput={(e) => edit({ closes: e.currentTarget.value })}
          />
        </label>
        <label>
          Session length<select
            aria-label="Session length"
            value={pattern.duration}
            onChange={(e) => edit({ duration: Number(e.currentTarget.value) })}
          >
            {[15, 30, 45, 60, 90, 120].map((n) => (
              <option key={n} value={n}>{n} minutes</option>
            ))}
          </select>
        </label>
      </div>
      <div class="settings-buttons">
        <label>
          Starting<input
            type="date"
            value={pattern.startDate}
            onInput={(e) => edit({ startDate: e.currentTarget.value })}
          />
        </label>
        <label>
          Fill the next<select
            aria-label="Fill the next"
            value={pattern.weeks}
            onChange={(e) => edit({ weeks: Number(e.currentTarget.value) })}
          >
            {[1, 2, 3, 4, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "week" : "weeks"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Timezone<select
          aria-label="Timezone"
          value={pattern.timeZone}
          onChange={(e) => edit({ timeZone: e.currentTarget.value })}
        >
          {zones.map((z) => (
            <option key={z} value={z}>{z.replaceAll("_", " ")}</option>
          ))}
        </select>
      </label>
      <p class="inspector-help">
        {preview
          ? `${
            preview.length - slots.length
          } new sessions · ${slots.length} existing sessions kept. Overlapping times are skipped.`
          : problem}
      </p>
      <div class="settings-buttons">
        <button
          type="button"
          class="button primary"
          disabled={!preview || preview.length === slots.length}
          onClick={() => {
            if (preview) {
              onChange(preview);
              setDirty(false);
              setError("");
              setMessage(
                `Added ${
                  preview.length - slots.length
                } sessions. Your existing events were kept.`,
              );
            }
          }}
        >
          Auto-fill schedule
        </button>
        {dirty && (
          <button
            type="button"
            class="button"
            onClick={() => {
              setPattern(defaults(slots));
              setDirty(false);
              setError("");
            }}
          >
            Discard changes
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      <p>
        {slots.length}{" "}
        scheduled sessions. Your booking service manages reservations and
        availability.
      </p>
      {slots.length > 0 && (
        <ul>
          {[...slots].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
            .slice(0, 3).map((s) => (
              <li key={s.id}>
                {s.title} · {new Date(s.start).toLocaleString(undefined, {
                  timeZone: pattern.timeZone,
                })}
              </li>
            ))}
        </ul>
      )}
      <details class="expert-options">
        <summary>Expert · Individual sessions</summary>
        <p>
          Add exceptions or edit an individual event. Dates below use ISO format
          with a timezone.
        </p>
        {slots.map((s, i) => (
          <details class="option-card" key={s.id}>
            <summary>
              {s.title} · {new Date(s.start).toLocaleDateString()}
            </summary>
            {(["title", "start", "end", "bookingUrl"] as const).map((k) => (
              <label key={k}>
                {k}
                <input
                  value={s[k]}
                  onChange={(e) => {
                    try {
                      onChange(
                        slots.map((v, j) =>
                          j === i ? { ...v, [k]: e.currentTarget.value } : v
                        ),
                      );
                      setError("");
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Invalid session",
                      );
                    }
                  }}
                />
              </label>
            ))}
            <button
              class="button"
              type="button"
              onClick={() => onChange(slots.filter((v) => v.id !== s.id))}
            >
              Remove session
            </button>
          </details>
        ))}
        <button
          type="button"
          class="button"
          disabled={slots.length >= 100}
          onClick={() => {
            try {
              const start = new Date(Date.now() + 86400000);
              onChange([...slots, {
                id: "session-" + crypto.randomUUID().slice(0, 8),
                title: pattern.title || "Consultation",
                start: start.toISOString(),
                end: new Date(start.getTime() + pattern.duration * 60000)
                  .toISOString(),
                bookingUrl: pattern.bookingUrl || "https://calendly.com/",
              }]);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Invalid session");
            }
          }}
        >
          + Add individual session
        </button>
      </details>
      {error && <p role="alert" class="form-error">{error}</p>}
    </section>
  );
}
