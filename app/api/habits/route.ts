import { NextResponse } from "next/server";
import { PEOPLE } from "@/lib/config";
import { readStore, updateDay } from "@/lib/storage";
import type { PersonId } from "@/lib/types";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    personId?: PersonId;
    date?: string;
    completed?: boolean[];
  };

  const person = PEOPLE.find((entry) => entry.id === body.personId);
  if (!person || !body.date || !Array.isArray(body.completed)) {
    return NextResponse.json(
      { error: "Invalid habit update payload." },
      { status: 400 }
    );
  }

  const normalized = person.tasks.reduce<Record<string, boolean>>(
    (accumulator, task, index) => {
      accumulator[task] = Boolean(body.completed?.[index]);
      return accumulator;
    },
    {}
  );

  const data = await updateDay(person.id, body.date, normalized);
  return NextResponse.json({ data });
}
