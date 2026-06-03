import { NextResponse } from "next/server";
import { PEOPLE } from "@/lib/config";
import { deleteDay, readStore, updateDay } from "@/lib/storage";
import type { PersonId } from "@/lib/types";

export async function GET() {
  try {
    const data = await readStore();
    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load habit data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save habit data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as {
      personId?: PersonId;
      date?: string;
    };

    const person = PEOPLE.find((entry) => entry.id === body.personId);
    if (!person || !body.date) {
      return NextResponse.json(
        { error: "Invalid habit delete payload." },
        { status: 400 }
      );
    }

    const data = await deleteDay(person.id, body.date);
    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete habit data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
