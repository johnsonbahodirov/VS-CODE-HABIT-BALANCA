import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupDirectory = path.join(root, "backups");
const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Set SUPABASE_DB_URL or DATABASE_URL before running this script.");
}

const sql = postgres(databaseUrl, { max: 1 });
const deleteMode = process.argv.includes("--delete");
const backupArgument = process.argv.indexOf("--backup");

async function readArchivedSnapshot(transaction, lockRows = false) {
  const habits = lockRows
    ? await transaction`
        SELECT * FROM public.habits
        WHERE archived_at IS NOT NULL
        ORDER BY id
        FOR UPDATE
      `
    : await transaction`
        SELECT * FROM public.habits
        WHERE archived_at IS NOT NULL
        ORDER BY id
      `;
  const ids = habits.map((habit) => habit.id);
  if (!ids.length) {
    return {
      count: 0,
      habits: [],
      completions: [],
      focusSessions: [],
      habitNotes: [],
      reminderDeliveries: [],
    };
  }

  const [completions, focusSessions, habitNotes, reminderDeliveries] = lockRows
    ? await Promise.all([
        transaction`
          SELECT * FROM public.habit_logs
          WHERE habit_id = ANY(${ids}::uuid[])
          ORDER BY habit_id, day
          FOR UPDATE
        `,
        transaction`
          SELECT * FROM public.work_sessions
          WHERE habit_id = ANY(${ids}::uuid[])
          ORDER BY id
          FOR UPDATE
        `,
        transaction`
          SELECT * FROM public.habit_notes
          WHERE habit_id = ANY(${ids}::uuid[])
          ORDER BY habit_id, day
          FOR UPDATE
        `,
        transaction`
          SELECT * FROM public.habit_reminder_deliveries
          WHERE habit_id = ANY(${ids}::uuid[])
          ORDER BY habit_id, day
          FOR UPDATE
        `,
      ])
    : await Promise.all([
        transaction`
          SELECT * FROM public.habit_logs
          WHERE habit_id = ANY(${ids}::uuid[])
          ORDER BY habit_id, day
        `,
        transaction`
          SELECT * FROM public.work_sessions
          WHERE habit_id = ANY(${ids}::uuid[])
          ORDER BY id
        `,
        transaction`
          SELECT * FROM public.habit_notes
          WHERE habit_id = ANY(${ids}::uuid[])
          ORDER BY habit_id, day
        `,
        transaction`
          SELECT * FROM public.habit_reminder_deliveries
          WHERE habit_id = ANY(${ids}::uuid[])
          ORDER BY habit_id, day
        `,
      ]);
  return {
    count: habits.length,
    habits,
    completions,
    focusSessions,
    habitNotes,
    reminderDeliveries,
  };
}

try {
  if (!deleteMode) {
    const backup = await sql.begin(async (transaction) => {
      await transaction`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
      return {
        exportedAt: new Date().toISOString(),
        ...(await readArchivedSnapshot(transaction)),
      };
    });

    await mkdir(backupDirectory, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    let suffix = 1;
    let backupPath;
    while (true) {
      const name = `archived-habits-${date}${suffix === 1 ? "" : `-${suffix}`}.json`;
      backupPath = path.join(backupDirectory, name);
      try {
        await writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, { flag: "wx" });
        break;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        suffix += 1;
      }
    }

    console.log(`Archived habits found: ${backup.count}`);
    console.log(`Backup saved to: ${path.relative(root, backupPath)}`);
    console.log("Review the count and backup before running the separate --delete step.");
  } else {
    if (backupArgument === -1 || !process.argv[backupArgument + 1]) {
      throw new Error("Pass the existing backup path with --backup <path>.");
    }
    const backupPath = path.resolve(root, process.argv[backupArgument + 1]);
    if (!backupPath.startsWith(`${backupDirectory}${path.sep}`)) {
      throw new Error("The backup must be inside the repository backups directory.");
    }
    const backup = JSON.parse(await readFile(backupPath, "utf8"));
    const snapshotKeys = [
      "habits",
      "completions",
      "focusSessions",
      "habitNotes",
      "reminderDeliveries",
    ];
    if (
      !Number.isInteger(backup.count) ||
      snapshotKeys.some((key) => !Array.isArray(backup[key])) ||
      backup.count !== backup.habits.length
    ) {
      throw new Error("The backup file is incomplete or has an invalid habit count.");
    }

    const deletedCount = await sql.begin(async (transaction) => {
      await transaction`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
      const current = await readArchivedSnapshot(transaction, true);
      const backupSnapshot = Object.fromEntries(snapshotKeys.map((key) => [key, backup[key]]));
      const currentSnapshot = Object.fromEntries(snapshotKeys.map((key) => [key, current[key]]));
      if (JSON.stringify(currentSnapshot) !== JSON.stringify(backupSnapshot)) {
        throw new Error("Archived habits changed since backup; create and review a fresh backup.");
      }
      if (!current.count) return 0;
      const ids = current.habits.map((habit) => habit.id);

      const deleted = await transaction`
        DELETE FROM public.habits
        WHERE id = ANY(${ids}::uuid[]) AND archived_at IS NOT NULL
        RETURNING id
      `;
      return deleted.length;
    });

    console.log(`Archived habits deleted: ${deletedCount}`);
    console.log(
      "Completion/note/reminder rows cascade; focus sessions are detached by their foreign key.",
    );
  }
} finally {
  await sql.end();
}
