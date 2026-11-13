import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

interface TenantContext { organizationId?: string; userId?: string }
const organizationContext = new AsyncLocalStorage<TenantContext | undefined>();
const wrappedClients = new WeakSet<PoolClient>();

export function clearOrganizationContext(): void {
  organizationContext.enterWith(undefined);
}

export function enterOrganizationContext(organizationId: string, userId?: string): void {
  organizationContext.enterWith({ organizationId, userId });
}

export function enterUserContext(userId: string): void {
  organizationContext.enterWith({ userId });
}

export function runWithOrganizationContext<T>(organizationId: string, callback: () => T, userId?: string): T {
  return organizationContext.run({ organizationId, userId }, callback);
}

function queryText(query: unknown): string {
  return typeof query === "string" ? query : String((query as { text?: unknown } | null)?.text ?? "");
}

function installTenantQueryContext(client: PoolClient): void {
  if (wrappedClients.has(client)) return;
  wrappedClients.add(client);
  const rawQuery = client.query.bind(client);
  let transactionOpen = false;
  let injecting = false;

  const setTenant = async (context: TenantContext) => {
    injecting = true;
    try { await rawQuery("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [context.organizationId ?? "", context.userId ?? ""]); }
    finally { injecting = false; }
  };

  client.query = ((...args: unknown[]) => {
    const callback = typeof args.at(-1) === "function" ? args.pop() as (error: Error | null, result?: QueryResult<QueryResultRow>) => void : undefined;
    const context = organizationContext.getStore();
    const text = queryText(args[0]).trim().toLowerCase();
    const isBegin = /^begin(?:\s|$)/.test(text);
    const isEnd = /^(?:commit|rollback)(?:\s|$)/.test(text);

    const execute = async () => {
      if (injecting || !context) return await (rawQuery as (...values: unknown[]) => Promise<QueryResult<QueryResultRow>>)(...args);
      if (isBegin) {
        const result = await (rawQuery as (...values: unknown[]) => Promise<QueryResult<QueryResultRow>>)(...args);
        transactionOpen = true;
        await setTenant(context);
        return result;
      }
      if (isEnd) {
        try { return await (rawQuery as (...values: unknown[]) => Promise<QueryResult<QueryResultRow>>)(...args); }
        finally { transactionOpen = false; }
      }
      if (transactionOpen) {
        await setTenant(context);
        return await (rawQuery as (...values: unknown[]) => Promise<QueryResult<QueryResultRow>>)(...args);
      }

      await (rawQuery as (...values: unknown[]) => Promise<QueryResult<QueryResultRow>>)("BEGIN");
      transactionOpen = true;
      try {
        await setTenant(context);
        const result = await (rawQuery as (...values: unknown[]) => Promise<QueryResult<QueryResultRow>>)(...args);
        await (rawQuery as (...values: unknown[]) => Promise<QueryResult<QueryResultRow>>)("COMMIT");
        transactionOpen = false;
        return result;
      } catch (error) {
        try { await (rawQuery as (...values: unknown[]) => Promise<QueryResult<QueryResultRow>>)("ROLLBACK"); }
        finally { transactionOpen = false; }
        throw error;
      }
    };

    if (callback) {
      void execute().then((result) => callback(null, result), (error: unknown) => callback(error instanceof Error ? error : new Error(String(error))));
      return undefined;
    }
    return execute();
  }) as PoolClient["query"];
}

/**
 * Installs transaction-local tenant context on every checked-out PostgreSQL
 * connection. Each standalone query is enclosed in a transaction so the
 * setting cannot leak through the pool. Drizzle transactions reuse one
 * connection and have the setting refreshed before each statement.
 */
export function installTenantContext(pool: Pool): void {
  const rawConnect = pool.connect.bind(pool);
  const rawPoolQuery = pool.query.bind(pool);
  pool.connect = ((...args: unknown[]) => {
    const callback = typeof args.at(-1) === "function" ? args.at(-1) as (error: Error | undefined, client?: PoolClient, release?: (error?: Error | boolean) => void) => void : undefined;
    if (callback) {
      rawConnect((error, client, release) => {
        if (!error && client) installTenantQueryContext(client);
        callback(error ?? undefined, client, release);
      });
      return undefined;
    }
    return (rawConnect as () => Promise<PoolClient>)().then((client) => {
      installTenantQueryContext(client);
      return client;
    });
  }) as Pool["connect"];

  pool.query = ((...args: unknown[]) => {
    const callbackIndex = args.findIndex((argument) => typeof argument === "function");
    const callback = callbackIndex >= 0 ? args[callbackIndex] as (error: Error | null, result?: QueryResult<QueryResultRow>) => void : undefined;
    if (callbackIndex >= 0) args.splice(callbackIndex, 1);
    if (!organizationContext.getStore()) {
      if (callback) return (rawPoolQuery as (...values: unknown[]) => unknown)(...args, callback);
      return (rawPoolQuery as (...values: unknown[]) => Promise<QueryResult<QueryResultRow>>)(...args);
    }

    const execute = async () => {
      const client = await (rawConnect as () => Promise<PoolClient>)();
      installTenantQueryContext(client);
      try {
        return await (client.query as (...values: unknown[]) => Promise<QueryResult<QueryResultRow>>)(...args);
      } finally {
        client.release();
      }
    };
    if (callback) {
      void execute().then((result) => callback(null, result), (error: unknown) => callback(error instanceof Error ? error : new Error(String(error))));
      return undefined;
    }
    return execute();
  }) as Pool["query"];
}
