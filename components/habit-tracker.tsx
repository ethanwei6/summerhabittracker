"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { END_DATE, PEOPLE, START_DATE } from "@/lib/config";
import {
  formatLongDate,
  listDates,
  monthLabel,
  parseIsoDate,
  toIsoDate,
  weekdayIndex
} from "@/lib/date";
import type { HabitStore, PersonId } from "@/lib/types";

type SelectedState = {
  personId: PersonId;
  date: string;
};

type ViewMode = "pick" | "person";
type PersonPanel = "form" | "calendar" | "overview";

const DATE_RANGE = listDates(START_DATE, END_DATE);
const TODAY = clampToRange(toIsoDate(new Date()));

const EMPTY_STORE: HabitStore = {
  you: {},
  girlfriend: {}
};

function clampToRange(date: string) {
  if (date < START_DATE) return START_DATE;
  if (date > END_DATE) return END_DATE;
  return date;
}

function completionCount(
  store: HabitStore,
  personId: PersonId,
  date: string,
  tasks: readonly string[]
) {
  const entry = store[personId]?.[date];
  return tasks.reduce(
    (count, task) => count + (entry?.[task] ? 1 : 0),
    0
  );
}

function colorForCount(count: number) {
  const palette = [
    "#b42318",
    "#d97706",
    "#f59e0b",
    "#84cc16",
    "#4ade80",
    "#15803d"
  ];

  return palette[count] ?? palette[0];
}

function draftForSelection(store: HabitStore, personId: PersonId, date: string) {
  const person = PEOPLE.find((entry) => entry.id === personId)!;
  const current = store[personId]?.[date];
  return person.tasks.map((task) => Boolean(current?.[task]));
}

function taskStatus(
  store: HabitStore,
  personId: PersonId,
  date: string,
  tasks: readonly string[]
) {
  const entry = store[personId]?.[date] ?? {};
  return tasks.map((task) => ({
    task,
    done: Boolean(entry[task])
  }));
}

function hasEntry(store: HabitStore, personId: PersonId, date: string) {
  return Boolean(store[personId]?.[date]);
}

function monthGroups() {
  const groups = new Map<string, string[]>();

  for (const date of DATE_RANGE) {
    const label = monthLabel(date);
    const current = groups.get(label) ?? [];
    current.push(date);
    groups.set(label, current);
  }

  return [...groups.entries()];
}

export function HabitTracker() {
  const [store, setStore] = useState<HabitStore>(EMPTY_STORE);
  const [selected, setSelected] = useState<SelectedState>({
    personId: "you",
    date: TODAY
  });
  const [view, setView] = useState<ViewMode>("pick");
  const [panel, setPanel] = useState<PersonPanel>("form");
  const [draftEdits, setDraftEdits] = useState<Record<string, boolean[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string>("Loading your tracker...");

  const selectedPerson = PEOPLE.find((person) => person.id === selected.personId)!;
  const selectionKey = `${selected.personId}:${selected.date}`;
  const draft =
    draftEdits[selectionKey] ??
    draftForSelection(store, selected.personId, selected.date);
  const selectedDayHasEntry = hasEntry(store, selected.personId, selected.date);

  function applySelection(nextSelection: SelectedState) {
    setSelected(nextSelection);

    const person = PEOPLE.find((entry) => entry.id === nextSelection.personId)!;
    setStatus(`Editing ${person.name}'s check-in for ${formatLongDate(nextSelection.date)}.`);
  }

  function openPersonWorkspace(personId: PersonId, date = selected.date) {
    applySelection({
      personId,
      date
    });
    setView("person");
    setPanel(hasEntry(store, personId, date) ? "calendar" : "form");
  }

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/habits", { cache: "no-store" });
      const payload = (await response.json()) as { data: HabitStore };
      setStore(payload.data);
      setIsLoading(false);
    }

    void load();
  }, []);

  const totals = useMemo(
    () =>
      PEOPLE.map((person) => ({
        ...person,
        completedDays: DATE_RANGE.filter(
          (date) => completionCount(store, person.id, date, person.tasks) === person.tasks.length
        ).length,
        totalChecks: DATE_RANGE.reduce(
          (sum, date) => sum + completionCount(store, person.id, date, person.tasks),
          0
        )
      })),
    [store]
  );

  async function save() {
    setStatus("Saving your check-in...");

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/habits", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              personId: selected.personId,
              date: selected.date,
              completed: draft
            })
          });

          const payload = (await response.json()) as { data?: HabitStore; error?: string };
          if (!response.ok || !payload.data) {
            setStatus(payload.error ?? "Something went wrong while saving.");
            return;
          }

          setStore(payload.data);
          setDraftEdits((current) => ({
            ...current,
            [selectionKey]: draft
          }));
          setStatus(`Saved ${selectedPerson.name}'s progress for ${formatLongDate(selected.date)}.`);
          setPanel("calendar");
        } catch {
          setStatus("The save request failed. Please try again in a moment.");
        }
      })();
    });
  }

  async function clearDay() {
    setStatus("Clearing this saved day...");

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/habits", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              personId: selected.personId,
              date: selected.date
            })
          });

          const payload = (await response.json()) as { data?: HabitStore; error?: string };
          if (!response.ok || !payload.data) {
            setStatus(payload.error ?? "Something went wrong while clearing this day.");
            return;
          }

          setStore(payload.data);
          setDraftEdits((current) => {
            const next = { ...current };
            delete next[selectionKey];
            return next;
          });
          setStatus(`Cleared ${selectedPerson.name}'s entry for ${formatLongDate(selected.date)}.`);
          setPanel("form");
        } catch {
          setStatus("The clear request failed. Please try again in a moment.");
        }
      })();
    });
  }

  function renderCalendar(
    personId: PersonId,
    tasks: readonly string[],
    variant: "person" | "overview"
  ) {
    return monthGroups().map(([label, dates]) => (
      <div key={`${personId}-${label}-${variant}`} className="month-block">
        <h3>{label}</h3>
        <div className="weekday-row">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={`${personId}-${label}-${day}-${variant}`}>{day}</span>
          ))}
        </div>
        <div className="month-grid">
          {Array.from({ length: weekdayIndex(dates[0]) }).map((_, index) => (
            <div key={`${personId}-${label}-empty-${index}-${variant}`} className="empty-cell" />
          ))}
          {dates.map((date) => {
            const count = completionCount(store, personId, date, tasks);
            const isSelected =
              selected.personId === personId && selected.date === date;
            const dayNumber = parseIsoDate(date).getDate();
            const statuses = taskStatus(store, personId, date, tasks);

            return (
              <button
                key={`${personId}-${date}-${variant}`}
                type="button"
                className={isSelected ? "day-cell selected" : "day-cell"}
                style={{ backgroundColor: colorForCount(count) }}
                onClick={() => openPersonWorkspace(personId, date)}
                aria-label={`${formatLongDate(date)}: ${count} of 5 habits completed`}
              >
                <span>{dayNumber}</span>
                <small>{count}/5</small>
                <div className="day-tooltip">
                  <strong>{formatLongDate(date)}</strong>
                  {statuses.map((item) => (
                    <div
                      key={`${personId}-${date}-${item.task}-${variant}`}
                      className={item.done ? "tooltip-task done" : "tooltip-task missed"}
                    >
                      <span>{item.done ? "Done" : "Missed"}</span>
                      <p>{item.task}</p>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    ));
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">Summer 2026</p>
        <h1>Habit tracker for the two of you.</h1>
        <p className="hero-copy">
          Check in once each night, watch the calendar fill from red to green,
          and keep the whole summer visible from March 12 through August 25.
        </p>
        <div className="legend">
          {[0, 1, 2, 3, 4, 5].map((count) => (
            <div key={count} className="legend-item">
              <span
                className="legend-swatch"
                style={{ backgroundColor: colorForCount(count) }}
              />
              <span>{count}/5</span>
            </div>
          ))}
        </div>
      </section>

      <section className="summary-grid">
        {totals.map((person) => (
          <article key={person.id} className="summary-card">
            <div className="summary-header">
              <h2>{person.name}</h2>
              <button
                className="ghost-button"
                type="button"
                onClick={() => openPersonWorkspace(person.id)}
              >
                Edit
              </button>
            </div>
            <p>{person.completedDays} fully green days</p>
            <strong>{person.totalChecks} total habits completed</strong>
          </article>
        ))}
      </section>

      {view === "pick" ? (
        <section className="picker-card">
          <div className="picker-copy">
            <p className="eyebrow">Step 1</p>
            <h2>Choose who is checking in tonight.</h2>
            <p className="hero-copy">
              Ethan and Annie each log their own habits first. After saving, the
              site opens the shared summer view so both calendars can be compared
              side by side. You can also toggle between a check-in form and calendar anytime.
            </p>
          </div>
          <div className="picker-grid">
            {PEOPLE.map((person) => (
              <button
                key={person.id}
                type="button"
                className="picker-button"
                onClick={() => openPersonWorkspace(person.id)}
              >
                <span className="picker-label">Log as</span>
                <strong>{person.name}</strong>
                <small>{person.tasks.length} daily habits</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {view === "person" ? (
        <section className="person-tab-panel">
          <section className="editor-card">
            <div className="editor-header">
              <div>
                <p className="eyebrow">Step 2</p>
                <h2>{selectedPerson.name}</h2>
                <p className="editor-subtitle">
                  Use the toggles to switch between the daily submission form, {selectedPerson.name}&apos;s calendar,
                  and the full summer overview.
                </p>
              </div>
              <div className="editor-actions">
                <button className="ghost-button" type="button" onClick={() => setView("pick")}>
                  Change person
                </button>
                <input
                  className="date-input"
                  type="date"
                  min={START_DATE}
                  max={END_DATE}
                  value={selected.date}
                  onChange={(event) =>
                    applySelection({
                      personId: selected.personId,
                      date: clampToRange(event.target.value)
                    })
                  }
                />
              </div>
            </div>
            <div className="panel-switcher" role="tablist" aria-label="Person workspace views">
              <button
                type="button"
                className={panel === "form" ? "switch active" : "switch"}
                onClick={() => setPanel("form")}
              >
                Check-in
              </button>
              <button
                type="button"
                className={panel === "calendar" ? "switch active" : "switch"}
                onClick={() => setPanel("calendar")}
              >
                Calendar
              </button>
              <button
                type="button"
                className={panel === "overview" ? "switch active" : "switch"}
                onClick={() => setPanel("overview")}
              >
                Summer view
              </button>
            </div>

            {panel === "form" ? (
              <>
                {selectedDayHasEntry ? (
                  <div className="submitted-banner">
                    <strong>{selectedPerson.name} already has a saved entry for this day.</strong>
                    <p>You can update the checkboxes below and resubmit to overwrite that day&apos;s progress.</p>
                  </div>
                ) : null}

                <div className="task-list">
                  {selectedPerson.tasks.map((task, index) => (
                    <label key={task} className={draft[index] ? "task checked" : "task"}>
                      <input
                        type="checkbox"
                        checked={draft[index]}
                        onChange={(event) =>
                          setDraftEdits((current) => ({
                            ...current,
                            [selectionKey]: draft.map((value, position) =>
                              position === index ? event.target.checked : value
                            )
                          }))
                        }
                      />
                      <span>{task}</span>
                    </label>
                  ))}
                </div>

                <div className="editor-footer">
                  <p className="status-text">{isLoading ? "Loading..." : status}</p>
                  <div className="footer-actions">
                    {selectedDayHasEntry ? (
                      <button
                        className="ghost-button danger-button"
                        type="button"
                        onClick={clearDay}
                        disabled={isPending}
                      >
                        Clear saved day
                      </button>
                    ) : null}
                    <button className="save-button" type="button" onClick={save} disabled={isPending}>
                      {isPending ? "Saving..." : selectedDayHasEntry ? "Resubmit day" : "Submit today"}
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {panel === "calendar" ? (
              <section className="calendar-grid">
                <article className="calendar-card">
                  <div className="calendar-heading">
                    <h2>{selectedPerson.name}&apos;s calendar</h2>
                    <p>
                      {selectedDayHasEntry
                        ? `The selected day already has a saved submission for ${selectedPerson.name}.`
                        : `The selected day does not have a saved submission yet for ${selectedPerson.name}.`}
                    </p>
                  </div>
                  {renderCalendar(selectedPerson.id, selectedPerson.tasks, "person")}
                </article>
              </section>
            ) : null}
          </section>

          {panel === "overview" ? (
            <section className="overview-panel">
              <div className="overview-header">
                <div>
                  <p className="eyebrow">Step 3</p>
                  <h2>Shared summer overview</h2>
                  <p className="hero-copy">
                    Both calendars live here so Ethan and Annie can compare momentum across the whole summer.
                  </p>
                </div>
                <div className="overview-actions">
                  {PEOPLE.map((person) => (
                    <button
                      key={person.id}
                      className="ghost-button"
                      type="button"
                      onClick={() => openPersonWorkspace(person.id)}
                    >
                      {person.name}&apos;s workspace
                    </button>
                  ))}
                </div>
              </div>

              <section className="calendar-grid dual-calendars">
                {PEOPLE.map((person) => (
                  <article key={person.id} className="calendar-card">
                    <div className="calendar-heading">
                      <h2>{person.name}&apos;s calendar</h2>
                      <p>Hover any day to see exactly which habits were done and which were missed.</p>
                    </div>
                    {renderCalendar(person.id, person.tasks, "overview")}
                  </article>
                ))}
              </section>
            </section>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
