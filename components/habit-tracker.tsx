"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useState,
  useTransition
} from "react";
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
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

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
  return tasks.reduce((count, task) => count + (entry?.[task] ? 1 : 0), 0);
}

function colorForCount(count: number) {
  const palette = [
    "#8f2d23",
    "#b85b2d",
    "#d4982c",
    "#97af38",
    "#5ca667",
    "#1c7c54"
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

function dayStateLabel(count: number, total: number) {
  if (count === total) return "Perfect day";
  if (count === 0) return "Not logged";
  return `${count} complete`;
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
  const [status, setStatus] = useState<string>("Loading the habit desk...");

  const selectedPerson = PEOPLE.find((person) => person.id === selected.personId)!;
  const selectionKey = `${selected.personId}:${selected.date}`;
  const draft =
    draftEdits[selectionKey] ??
    draftForSelection(store, selected.personId, selected.date);
  const selectedDayHasEntry = hasEntry(store, selected.personId, selected.date);
  const selectedDayCount = completionCount(
    store,
    selected.personId,
    selected.date,
    selectedPerson.tasks
  );

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
      try {
        const response = await fetch("/api/habits", { cache: "no-store" });
        const payload = (await response.json()) as { data?: HabitStore; error?: string };

        if (!response.ok || !payload.data) {
          setStatus(payload.error ?? "We couldn't load the current tracker.");
          setIsLoading(false);
          return;
        }

        setStore(payload.data);
        setStatus("Choose a person to begin tonight's check-in.");
      } catch {
        setStatus("The tracker could not load. Please refresh and try again.");
      } finally {
        setIsLoading(false);
      }
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

  const totalPerfectDays = totals.reduce((sum, person) => sum + person.completedDays, 0);
  const totalChecksLogged = totals.reduce((sum, person) => sum + person.totalChecks, 0);
  const selectedSummary = totals.find((person) => person.id === selected.personId);
  const workspaceStyle = {
    "--person-accent": selectedPerson.accent
  } as CSSProperties;

  function updateDraft(index: number, checked: boolean) {
    setDraftEdits((current) => ({
      ...current,
      [selectionKey]: draft.map((value, position) => (position === index ? checked : value))
    }));
  }

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
        <div className="month-header">
          <h3>{label}</h3>
          <span>{dates.length} days</span>
        </div>
        <div className="weekday-row">
          {WEEKDAYS.map((day) => (
            <span key={`${personId}-${label}-${day}-${variant}`}>{day}</span>
          ))}
        </div>
        <div className="month-grid">
          {Array.from({ length: weekdayIndex(dates[0]) }).map((_, index) => (
            <div key={`${personId}-${label}-empty-${index}-${variant}`} className="empty-cell" />
          ))}
          {dates.map((date) => {
            const count = completionCount(store, personId, date, tasks);
            const isSelected = selected.personId === personId && selected.date === date;
            const dayNumber = parseIsoDate(date).getDate();
            const statuses = taskStatus(store, personId, date, tasks);

            return (
              <button
                key={`${personId}-${date}-${variant}`}
                type="button"
                className={isSelected ? "calendar-day selected" : "calendar-day"}
                style={{ "--day-tone": colorForCount(count) } as CSSProperties}
                onClick={() => openPersonWorkspace(personId, date)}
                aria-label={`${formatLongDate(date)}: ${count} of 5 habits completed`}
              >
                <div className="calendar-day-top">
                  <span className="calendar-day-number">{dayNumber}</span>
                  <small className="calendar-day-score">{count}/5</small>
                </div>
                <div className="calendar-day-bottom">
                  <span className="calendar-day-state">{dayStateLabel(count, tasks.length)}</span>
                </div>
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
    <main className="tracker-app" style={workspaceStyle}>
      <div className="ambient-orb ambient-orb-left" />
      <div className="ambient-orb ambient-orb-right" />

      <header className="shell-card shell-header">
        <div className="brand-lockup">
          <p className="kicker">Summer 2026</p>
          <div>
            <h1>Habit desk</h1>
            <p className="lede">
              A shared evening check-in for Ethan and Annie. Track the day fast,
              then read the whole summer like a living record.
            </p>
          </div>
        </div>
        <div className="header-meta">
          <div className="meta-pill">Mar 12 to Aug 25</div>
          <div className="meta-pill">{DATE_RANGE.length} days in view</div>
          <div className="meta-pill">{totalChecksLogged} habits logged</div>
        </div>
      </header>

      <section className="hero-grid">
        <article className="shell-card statement-card">
          <div className="section-head">
            <div>
              <p className="kicker">Shared progress</p>
              <h2>Quiet, deliberate, and built to be used nightly.</h2>
            </div>
          </div>
          <p className="body-copy">
            The goal here is not a flashy streak machine. It is a clear daily ritual:
            pick a person, log the day, and keep a trustworthy visual record of the summer.
          </p>
          <div className="stat-ribbon">
            <div>
              <span className="stat-value">{totalPerfectDays}</span>
              <span className="stat-label">perfect days</span>
            </div>
            <div>
              <span className="stat-value">{totalChecksLogged}</span>
              <span className="stat-label">completed habits</span>
            </div>
            <div>
              <span className="stat-value">{totals.length}</span>
              <span className="stat-label">active trackers</span>
            </div>
          </div>
          <p className="status-line">{isLoading ? "Loading..." : status}</p>
        </article>

        <div className="mini-summary-grid">
          {totals.map((person) => (
            <article key={person.id} className="shell-card person-summary-card">
              <div className="person-summary-top">
                <div>
                  <p className="summary-caption">Workspace</p>
                  <h3>{person.name}</h3>
                </div>
                <button
                  className="inline-button"
                  type="button"
                  onClick={() => openPersonWorkspace(person.id)}
                >
                  Open
                </button>
              </div>
              <p className="body-copy compact-copy">
                {person.tasks.length} daily tasks, hoverable calendar detail, and clean day-by-day resubmits.
              </p>
              <div className="summary-metrics">
                <div>
                  <span className="summary-metric">{person.completedDays}</span>
                  <span className="summary-metric-label">perfect days</span>
                </div>
                <div>
                  <span className="summary-metric">{person.totalChecks}</span>
                  <span className="summary-metric-label">checks logged</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {view === "pick" ? (
        <section className="shell-card launchpad-card">
          <div className="section-head launchpad-head">
            <div>
              <p className="kicker">Start here</p>
              <h2>Choose whose desk you want to open tonight.</h2>
            </div>
            <p className="body-copy">
              Each workspace holds a focused check-in surface, a private calendar view,
              and the shared board for comparing the whole season.
            </p>
          </div>

          <div className="launchpad-grid">
            {PEOPLE.map((person) => (
              <button
                key={person.id}
                type="button"
                className="launchpad-button"
                onClick={() => openPersonWorkspace(person.id)}
              >
                <div className="launchpad-top">
                  <span className="summary-caption">Open workspace</span>
                  <span className="launchpad-dot" style={{ backgroundColor: person.accent }} />
                </div>
                <strong>{person.name}</strong>
                <ul className="task-preview">
                  {person.tasks.slice(0, 3).map((task) => (
                    <li key={task}>{task}</li>
                  ))}
                </ul>
                <span className="launchpad-footer">Enter daily log</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {view === "person" ? (
        <section className="workspace-grid">
          <aside className="shell-card workspace-rail">
            <div className="rail-block">
              <p className="kicker">Current desk</p>
              <h2>{selectedPerson.name}</h2>
              <p className="body-copy">
                One workspace for logging the day, checking the personal calendar,
                and dropping into the shared seasonal board.
              </p>
            </div>

            <div className="rail-block people-switcher">
              {PEOPLE.map((person) => {
                const active = person.id === selected.personId;
                const count = completionCount(store, person.id, selected.date, person.tasks);

                return (
                  <button
                    key={person.id}
                    type="button"
                    className={active ? "people-switch active" : "people-switch"}
                    onClick={() => openPersonWorkspace(person.id, selected.date)}
                  >
                    <div>
                      <strong>{person.name}</strong>
                      <small>{count}/5 on selected day</small>
                    </div>
                    <span className="people-switch-accent" style={{ backgroundColor: person.accent }} />
                  </button>
                );
              })}
            </div>

            <div className="rail-block focus-card">
              <span className="focus-kicker">Selected day</span>
              <strong>{formatLongDate(selected.date)}</strong>
              <div className="focus-metric">
                <span>{selectedDayCount}/5</span>
                <small>{selectedDayHasEntry ? "saved entry" : "not submitted yet"}</small>
              </div>
              <div className="focus-divider" />
              <div className="focus-grid">
                <div>
                  <span className="summary-metric">{selectedSummary?.completedDays ?? 0}</span>
                  <span className="summary-metric-label">perfect days</span>
                </div>
                <div>
                  <span className="summary-metric">{selectedSummary?.totalChecks ?? 0}</span>
                  <span className="summary-metric-label">checks logged</span>
                </div>
              </div>
            </div>

            <button className="ghost-button" type="button" onClick={() => setView("pick")}>
              Back to home
            </button>
          </aside>

          <section className="workspace-content">
            <section className="shell-card composer-card">
              <div className="composer-head">
                <div>
                  <p className="kicker">Daily log</p>
                  <h2>{selectedPerson.name}&apos;s habit desk</h2>
                  <p className="body-copy">
                    Log the exact day, switch views without losing context, and resubmit safely when plans change.
                  </p>
                </div>
                <div className="composer-controls">
                  <span className={selectedDayHasEntry ? "status-chip saved" : "status-chip"}>
                    {selectedDayHasEntry ? "Saved day" : "Open day"}
                  </span>
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

              <div className="segmented-control" role="tablist" aria-label="Person workspace views">
                <button
                  type="button"
                  className={panel === "form" ? "segment active" : "segment"}
                  onClick={() => setPanel("form")}
                >
                  Check-in
                </button>
                <button
                  type="button"
                  className={panel === "calendar" ? "segment active" : "segment"}
                  onClick={() => setPanel("calendar")}
                >
                  Calendar
                </button>
                <button
                  type="button"
                  className={panel === "overview" ? "segment active" : "segment"}
                  onClick={() => setPanel("overview")}
                >
                  Summer board
                </button>
              </div>

              {panel === "form" ? (
                <div className="panel-stack">
                  {selectedDayHasEntry ? (
                    <div className="callout saved-callout">
                      <strong>{selectedPerson.name} already has a saved entry for this date.</strong>
                      <p>Change anything below and resubmit to overwrite the day cleanly.</p>
                    </div>
                  ) : null}

                  <div className="checklist">
                    {selectedPerson.tasks.map((task, index) => (
                      <label key={task} className={draft[index] ? "check-item checked" : "check-item"}>
                        <div className="check-index">{index + 1}</div>
                        <div className="check-copy">
                          <span>{task}</span>
                          <small>{draft[index] ? "Completed" : "Pending"}</small>
                        </div>
                        <input
                          type="checkbox"
                          checked={draft[index]}
                          onChange={(event) => updateDraft(index, event.target.checked)}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="composer-footer">
                    <p className="status-line">{isLoading ? "Loading..." : status}</p>
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
                        {isPending ? "Saving..." : selectedDayHasEntry ? "Resubmit day" : "Submit day"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {panel === "calendar" ? (
                <section className="calendar-panel">
                  <div className="section-head">
                    <div>
                      <p className="kicker">Personal calendar</p>
                      <h2>{selectedPerson.name}&apos;s season view</h2>
                    </div>
                    <p className="body-copy">
                      Hover any day to see the full habit breakdown, or click a day to jump back into that check-in.
                    </p>
                  </div>
                  <div className="calendar-board">{renderCalendar(selectedPerson.id, selectedPerson.tasks, "person")}</div>
                </section>
              ) : null}
            </section>

            {panel === "overview" ? (
              <section className="shell-card overview-card">
                <div className="section-head overview-head">
                  <div>
                    <p className="kicker">Shared board</p>
                    <h2>Side-by-side summer progress</h2>
                  </div>
                  <p className="body-copy">
                    Ethan and Annie both stay visible here so the season reads like a single shared project.
                  </p>
                </div>

                <section className="overview-grid">
                  {PEOPLE.map((person) => (
                    <article key={person.id} className="calendar-surface">
                      <div className="calendar-surface-head">
                        <div>
                          <p className="summary-caption">Calendar</p>
                          <h3>{person.name}</h3>
                        </div>
                        <button
                          className="inline-button"
                          type="button"
                          onClick={() => openPersonWorkspace(person.id)}
                        >
                          Open desk
                        </button>
                      </div>
                      <div className="calendar-board">{renderCalendar(person.id, person.tasks, "overview")}</div>
                    </article>
                  ))}
                </section>
              </section>
            ) : null}
          </section>
        </section>
      ) : null}
    </main>
  );
}
