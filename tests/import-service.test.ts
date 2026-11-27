import { describe, expect, it } from "vitest";
import { influencerInput, normalizeHandle } from "@/lib/services/influencers";
import {
  buildJobReportCsv,
  cancelImportJob,
  executeImportJob,
  getMemberRole,
  getImportJobDetails,
  listImportJobs,
  rollbackImportJob,
} from "@/lib/services/imports";
import type { Db } from "@/lib/supabase/server";

/**
 * Stateful in-memory Supabase mock matching Thunder's table contracts,
 * testing idempotency, partial failures, cancellation, permission checks,
 * safe rollback (skipping subsequently modified records), and existing influencer regression.
 */
function createMockDb(role: "owner" | "admin" | "member" | "viewer" = "admin") {
  const tables: Record<string, Record<string, unknown>[]> = {
    workspace_members_thunder: [{ workspace_id: "ws-1", user_id: "user-1", role }],
    influencers_thunder: [],
    import_jobs_thunder: [],
    import_row_results_thunder: [],
    import_audit_records_thunder: [],
    import_mapping_templates_thunder: [],
  };
  const nextUuid = () => crypto.randomUUID();

  class QueryBuilder {
    private filters: ((r: Record<string, unknown>) => boolean)[] = [];
    private op: "select" | "insert" | "update" = "select";
    private payload: unknown = null;
    private isHead = false;
    private singleMode: "single" | "maybe" | null = null;
    private orderBy: { col: string; asc: boolean } | null = null;
    private limitNum: number | null = null;

    constructor(private table: string) {}

    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.head) this.isHead = true;
      return this;
    }
    insert(data: Record<string, unknown> | Record<string, unknown>[]) {
      this.op = "insert";
      this.payload = data;
      return this;
    }
    update(data: Record<string, unknown>) {
      this.op = "update";
      this.payload = data;
      return this;
    }
    eq(col: string, val: unknown) {
      this.filters.push((r) => r[col] === val);
      return this;
    }
    ilike(col: string, val: string) {
      this.filters.push((r) => String(r[col] ?? "").toLowerCase() === val.toLowerCase());
      return this;
    }
    in(col: string, vals: unknown[]) {
      this.filters.push((r) => vals.includes(r[col]));
      return this;
    }
    is(col: string, val: unknown) {
      this.filters.push((r) => (r[col] ?? null) === val);
      return this;
    }
    gte(col: string, val: string) {
      this.filters.push((r) => String(r[col] ?? "") >= val);
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.orderBy = { col, asc: opts?.ascending ?? true };
      return this;
    }
    range(from: number, to: number) {
      this.limitNum = to - from + 1;
      return this;
    }
    limit(n: number) {
      this.limitNum = n;
      return this;
    }
    single() {
      this.singleMode = "single";
      return this.exec();
    }
    maybeSingle() {
      this.singleMode = "maybe";
      return this.exec();
    }
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: unknown; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return this.exec().then(onfulfilled, onrejected);
    }

    private async exec(): Promise<{ data: unknown; error: unknown; count?: number }> {
      const store = tables[this.table];
      const now = new Date().toISOString();

      if (this.op === "insert") {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload as Record<string, unknown>];
        const inserted: Record<string, unknown>[] = [];
        for (const item of items) {
          if (this.table === "influencers_thunder" && item.handle) {
            const clash = store.find(
              (r) => r.workspace_id === item.workspace_id && r.handle === item.handle && !r.deleted_at,
            );
            if (clash) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
          if (this.table === "import_jobs_thunder" && item.idempotency_key) {
            const clash = store.find(
              (r) => r.workspace_id === item.workspace_id && r.idempotency_key === item.idempotency_key,
            );
            if (clash) return { data: null, error: { code: "23505", message: "duplicate idempotency key" } };
          }
          const rec: Record<string, unknown> = structuredClone({
            id: nextUuid(),
            created_at: now,
            updated_at: now,
            deleted_at: null,
            ...item,
          });
          store.push(rec);
          inserted.push(structuredClone(rec));
        }
        const out = this.singleMode ? inserted[0] ?? null : inserted;
        return { data: out, error: null };
      }

      const matched = store.filter((r) => this.filters.every((fn) => fn(r)));

      if (this.op === "update") {
        const patch = this.payload as Record<string, unknown>;
        const bumpTime = new Date(Date.now() + 1000).toISOString();
        for (const r of matched) {
          Object.assign(r, structuredClone(patch), { updated_at: bumpTime });
        }
        const out = this.singleMode ? matched[0] ?? null : matched;
        return { data: structuredClone(out), error: null };
      }

      if (this.isHead) {
        return { data: null, error: null, count: matched.length };
      }

      const sorted = [...matched];
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        sorted.sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? (asc ? -1 : 1) : (asc ? 1 : -1)));
      }
      const sliced = this.limitNum !== null ? sorted.slice(0, this.limitNum) : sorted;
      if (this.singleMode === "single" || this.singleMode === "maybe") {
        return { data: structuredClone(sliced[0] ?? null), error: null };
      }
      return { data: structuredClone(sliced), error: null };
    }
  }

  return {
    db: { from: (t: string) => new QueryBuilder(t) } as unknown as Db,
    tables,
  };
}

describe("Backend Import Execution, Idempotency, Permissions & Rollback", () => {
  it("keeps legacy workspace memberships import-capable when the role column is absent", async () => {
    const { db, tables } = createMockDb();
    delete tables.workspace_members_thunder[0].role;

    await expect(getMemberRole(db, "ws-1", "user-1")).resolves.toBe("admin");
  });

  it("executes partial imports, blocks repeated idempotent submissions, and exports safe reports", async () => {
    const { db, tables } = createMockDb("admin");
    const rows = [
      { Name: "Valid Creator", IG: "@valid_one", Followers: "25K", Email: "valid@test.com" },
      { Name: "Invalid Creator", IG: "https://instagram.com/reel/bad", Followers: "10K", Email: "bad" },
    ];
    const mapping = { Name: "name", IG: "handle", Followers: "followers", Email: "email" } as const;

    const res = await executeImportJob(db, "ws-1", "user-1", "admin@thunder.test", {
      idempotencyKey: "idem-123",
      sourceType: "csv",
      fileName: "creators.csv",
      duplicateStrategy: "merge",
      rows,
      mapping,
    });

    expect(res.status).toBe("partially_completed");
    expect(res.created).toBe(1);
    expect(res.failed).toBe(1);
    expect(tables.influencers_thunder).toHaveLength(1);

    // Repeated submission with same idempotencyKey returns existing job without creating duplicates
    const retry = await executeImportJob(db, "ws-1", "user-1", "admin@thunder.test", {
      idempotencyKey: "idem-123",
      sourceType: "csv",
      fileName: "creators.csv",
      duplicateStrategy: "merge",
      rows,
      mapping,
    });
    expect(retry.idempotentHit).toBe(true);
    expect(retry.jobId).toBe(res.jobId);
    expect(tables.influencers_thunder).toHaveLength(1);

    const history = await listImportJobs(db, "ws-1");
    expect(history).toHaveLength(1);

    const details = await getImportJobDetails(db, "ws-1", res.jobId);
    expect(details.rows).toHaveLength(2);

    const failedCsv = await buildJobReportCsv(db, "ws-1", res.jobId, "failed");
    expect(failedCsv).toContain("Invalid Creator");
    expect(failedCsv).not.toContain("Valid Creator");
  });

  it("enforces viewer permissions and safely rolls back unmodified records while preserving later edits", async () => {
    const viewerMock = createMockDb("viewer");
    await expect(
      executeImportJob(viewerMock.db, "ws-1", "user-1", "viewer@thunder.test", {
        sourceType: "csv",
        duplicateStrategy: "merge",
        rows: [{ Name: "Test", IG: "@test" }],
        mapping: { Name: "name", IG: "handle" },
      }),
    ).rejects.toThrow(/permission/i);

    const { db, tables } = createMockDb("admin");
    const exec = await executeImportJob(db, "ws-1", "user-1", "admin@thunder.test", {
      sourceType: "csv",
      duplicateStrategy: "merge",
      rows: [
        { Name: "Untouched Creator", IG: "@untouched_one" },
        { Name: "Edited Later Creator", IG: "@edited_later" },
      ],
      mapping: { Name: "name", IG: "handle" },
    });
    expect(exec.created).toBe(2);

    // Simulate another teammate editing the second influencer after import
    const secondInf = tables.influencers_thunder.find((r) => r.handle === "edited_later")!;
    secondInf.city = "Chennai";
    secondInf.updated_at = "2099-01-01T00:00:00.000Z";

    const rb = await rollbackImportJob(db, "ws-1", "user-1", exec.jobId);
    expect(rb.revertedCreates).toBe(1);
    expect(rb.skippedModified).toBe(1);

    const untouched = tables.influencers_thunder.find((r) => r.handle === "untouched_one")!;
    expect(untouched.deleted_at).not.toBeNull();
    expect(secondInf.deleted_at).toBeNull();
    expect(secondInf.city).toBe("Chennai");
  });

  it("supports cancelling a pending/processing job and keeps existing influencer validation intact", async () => {
    const { db, tables } = createMockDb("admin");
    tables.import_jobs_thunder.push({
      id: "00000001-0000-4000-8000-000000000099",
      workspace_id: "ws-1",
      status: "processing",
      created_at: new Date().toISOString(),
    });
    const cancelled = await cancelImportJob(db, "ws-1", "user-1", "00000001-0000-4000-8000-000000000099");
    expect(cancelled.status).toBe("cancelled");

    // Existing influencer regression check
    expect(normalizeHandle("https://instagram.com/Test.User/")).toBe("test.user");
    const parsed = influencerInput.safeParse({
      name: "Test User",
      handle: "@test.user",
      open_to_barter: false,
      languages: ["english"],
      niche_tags: ["food"],
      content_styles: [],
      formats: ["reel"],
      sample_posts: [],
    });
    expect(parsed.success).toBe(true);
  });
});
