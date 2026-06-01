import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { del, list, put } from "@vercel/blob";
import type { HabitStore, PersonId } from "./types";

const EMPTY_STORE: HabitStore = {
  you: {},
  girlfriend: {}
};

const LOCAL_DIR = path.join(process.cwd(), "data");
const LOCAL_FILE = path.join(LOCAL_DIR, "habits.json");
const BLOB_PREFIX = "summer-habit-tracker/habits/";
const LEGACY_BLOB_PATH = "summer-habit-tracker/habits.json";

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

function missingBlobError() {
  return new Error(
    "This deployment is missing Vercel Blob storage. Add BLOB_READ_WRITE_TOKEN in Vercel and redeploy."
  );
}

async function readLocalStore() {
  try {
    const file = await readFile(LOCAL_FILE, "utf8");
    return JSON.parse(file) as HabitStore;
  } catch {
    return structuredClone(EMPTY_STORE);
  }
}

async function writeLocalStore(store: HabitStore) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(store, null, 2), "utf8");
}

async function readBlobStore() {
  const blob = await getLatestBlob();

  if (!blob) {
    return structuredClone(EMPTY_STORE);
  }

  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to read saved habits from Vercel Blob.");
  }

  return (await response.json()) as HabitStore;
}

async function writeBlobStore(store: HabitStore) {
  const pathname = `${BLOB_PREFIX}${Date.now().toString().padStart(16, "0")}.json`;
  const nextBlob = await put(pathname, JSON.stringify(store, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json"
  });

  const oldBlobs = await listCandidateBlobs();
  await Promise.all(
    oldBlobs
      .filter((blob) => blob.pathname !== nextBlob.pathname)
      .map((blob) => del(blob.url))
  );
}

async function listCandidateBlobs() {
  const [versioned, legacy] = await Promise.all([
    list({ prefix: BLOB_PREFIX, limit: 1000 }),
    list({ prefix: LEGACY_BLOB_PATH, limit: 10 })
  ]);

  return [...versioned.blobs, ...legacy.blobs];
}

async function getLatestBlob() {
  const candidates = await listCandidateBlobs();
  const versionedCandidates = candidates.filter((blob) =>
    blob.pathname.startsWith(BLOB_PREFIX)
  );

  if (versionedCandidates.length > 0) {
    return versionedCandidates.slice(1).reduce(
      (latest, current) => (current.pathname > latest.pathname ? current : latest),
      versionedCandidates[0]
    );
  }

  return candidates.find((blob) => blob.pathname === LEGACY_BLOB_PATH);
}

export async function readStore() {
  if (isVercelRuntime() && !hasBlobToken()) {
    return structuredClone(EMPTY_STORE);
  }

  return hasBlobToken() ? readBlobStore() : readLocalStore();
}

export async function updateDay(
  personId: PersonId,
  date: string,
  completed: Record<string, boolean>
) {
  const store = await readStore();
  store[personId][date] = completed;

  if (hasBlobToken()) {
    await writeBlobStore(store);
  } else if (isVercelRuntime()) {
    throw missingBlobError();
  } else {
    await writeLocalStore(store);
  }

  return store;
}
