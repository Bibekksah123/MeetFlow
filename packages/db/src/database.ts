import { sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase, PostgresJsTransaction } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { schema } from "./schema";

type DatabaseSchema = typeof schema;
type DatabaseRelations = ExtractTablesWithRelations<DatabaseSchema>;
export type UserDatabaseTransaction = PostgresJsTransaction<DatabaseSchema, DatabaseRelations>;

let connection: ReturnType<typeof postgres> | undefined;
let database: PostgresJsDatabase<DatabaseSchema> | undefined;

function getDatabase(): PostgresJsDatabase<DatabaseSchema> {
  if (database) return database;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw createDatabaseError(
      "DATABASE_URL_MISSING",
      "DATABASE_URL is required for database access.",
    );
  }

  connection = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  database = drizzle({ client: connection, schema });
  return database;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Run user-facing queries as Supabase's authenticated role with transaction-local claims. */
export async function withUserDatabase<T>(
  userId: string,
  callback: (transaction: UserDatabaseTransaction) => Promise<T>,
  options?: { email?: string | null },
): Promise<T> {
  if (!uuidPattern.test(userId)) {
    throw createDatabaseError("INVALID_USER_ID", "A valid authenticated user ID is required.");
  }

  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(sql.raw("SET LOCAL ROLE authenticated"));
    await transaction.execute(sql`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`);
    if (options?.email) {
      await transaction.execute(
        sql`SELECT set_config('request.jwt.claim.email', ${options.email}, true)`,
      );
    }
    return callback(transaction);
  });
}

/** Run trusted background-worker queries with Supabase's server-side database role. */
export async function withWorkerDatabase<T>(
  callback: (transaction: UserDatabaseTransaction) => Promise<T>,
): Promise<T> {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(sql.raw("SET LOCAL ROLE service_role"));
    return callback(transaction);
  });
}

function createDatabaseError(code: "DATABASE_URL_MISSING" | "INVALID_USER_ID", message: string) {
  return Object.assign(new Error(message), { code });
}

/** Close the shared connection pool during worker shutdown or test teardown. */
export async function closeDatabase(): Promise<void> {
  const activeConnection = connection;
  connection = undefined;
  database = undefined;
  if (activeConnection) await activeConnection.end({ timeout: 5 });
}
