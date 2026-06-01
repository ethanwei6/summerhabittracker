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

type ViewMode = "pick" | "log" | "overview";

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
  const [draftEdits, setDraftEdits] = useState<Record<string, boolean[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string>("Loading your tracker...");

  const selectedPerson = PEOPLE.find((person) => person.id === selected.personId)!;
  const selectionKey = `${selected.personId}:${selected.date}`;
  const draft =
    draftEdits[selectionKey] ??
    draftForSelection(store, selected.personId, selected.date);

  function applySelection(nextSelection: SelectedState) {
    setSelected(nextSelection);

    const person = PEOPLE.find((entry) => entry.id === nextSelection.personId)!;
    setStatus(`Editing ${person.name}'s check-in for ${formatLongDate(nextSelection.date)}.`);
  }

  function beginLogging(personId: PersonId) {
    applySelection({
      personId,
      date: selected.date
    });
    setView("log");
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
          setView("overview");
        } catch {
          setStatus("The save request failed. Please try again in a moment.");
        }
      })();
    });
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
                onClick={() => beginLogging(person.id)}
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
              side by side.
            </p>
          </div>
          <div className="picker-grid">
            {PEOPLE.map((person) => (
              <button
                key={person.id}
                type="button"
                className="picker-button"
                onClick={() => beginLogging(person.id)}
              >
                <span className="picker-label">Log as</span>
                <strong>{person.name}</strong>
                <small>{person.tasks.length} daily habits</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {view === "log" ? (
        <section className="person-tab-panel">
          <section className="editor-card">
            <div className="editor-header">
              <div>
                <p className="eyebrow">Step 2</p>
                <h2>{selectedPerson.name}</h2>
                <p className="editor-subtitle">
                  Check off today&apos;s habits, save the day, then jump into the shared calendar view.
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
              <button className="save-button" type="button" onClick={save} disabled={isPending}>
                {isPending ? "Saving..." : "Submit today"}
              </button>
            </div>
          </section>
        </section>
      ) : null}

      {view === "overview" ? (
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
                  onClick={() => beginLogging(person.id)}
                >
                  Log as {person.name}
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

                {monthGroups().map(([label, dates]) => (
                  <div key={`${person.id}-${label}`} className="month-block">
                    <h3>{label}</h3>
                    <div className="weekday-row">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <span key={`${person.id}-${label}-${day}`}>{day}</span>
                      ))}
                    </div>
                    <div className="month-grid">
                      {Array.from({ length: weekdayIndex(dates[0]) }).map((_, index) => (
                        <div key={`${person.id}-${label}-empty-${index}`} className="empty-cell" />
                      ))}
                      {dates.map((date) => {
                        const count = completionCount(store, person.id, date, person.tasks);
                        const isSelected =
                          selected.personId === person.id && selected.date === date;
                        const dayNumber = parseIsoDate(date).getDate();
                        const statuses = taskStatus(store, person.id, date, person.tasks);

                        return (
                          <button
                            key={`${person.id}-${date}`}
                            type="button"
                            className={isSelected ? "day-cell selected" : "day-cell"}
                            style={{ backgroundColor: colorForCount(count) }}
                            onClick={() => beginLogging(person.id)}
                            aria-label={`${formatLongDate(date)}: ${count} of 5 habits completed`}
                          >
                            <span>{dayNumber}</span>
                            <small>{count}/5</small>
                            <div className="day-tooltip">
                              <strong>{formatLongDate(date)}</strong>
                              {statuses.map((item) => (
                                <div
                                  key={`${person.id}-${date}-${item.task}`}
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
                ))}
              </article>
            ))}
          </section>
        </section>
      ) : null}
    </main>
  );
}
