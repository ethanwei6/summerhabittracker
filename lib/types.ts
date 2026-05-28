export type PersonId = "you" | "girlfriend";

export type DayEntry = Record<string, boolean>;

export type PersonHabitData = Record<string, DayEntry>;

export type HabitStore = Record<PersonId, PersonHabitData>;
