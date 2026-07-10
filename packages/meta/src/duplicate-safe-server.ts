/**
 * Duplicate-safe registration for the meta aggregator.
 *
 * Meta merges every package into a single MCP namespace. The SDK throws
 * `Tool <name> is already registered` when two packages export the same tool
 * name. Because each package registers inside one try/catch, that throw used to
 * abort the *rest of that package* — a name collision silently dropped every
 * tool the package had not yet registered. `azure-devops-admin` lost 28 of its
 * 32 tools this way.
 *
 * The proxy below turns a collision into a per-name skip: the first package to
 * claim a name keeps it, later packages lose only the colliding name and go on
 * registering everything else. Registration order in `registerAllTools` therefore
 * decides which package owns a shared name.
 *
 * Only the `is already registered` error is swallowed; anything else (a missing
 * optional dependency, a bad schema) still propagates to the caller's try/catch.
 */

export interface SkippedRegistration {
  package: string;
  kind: "tool" | "prompt";
  name: string;
}

const DUPLICATE_MESSAGE = / is already registered$/;

/**
 * Wrap `server` so `tool()` and `prompt()` skip an already-registered name
 * rather than throwing. Every skip is appended to `skipped`.
 */
export function duplicateSafeServer(
  server: any,
  packageName: string,
  skipped: SkippedRegistration[],
): any {
  const guard =
    (kind: "tool" | "prompt") =>
    (...args: unknown[]) => {
      try {
        return server[kind](...args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!DUPLICATE_MESSAGE.test(message)) throw error;
        skipped.push({ package: packageName, kind, name: String(args[0]) });
        return undefined;
      }
    };

  return new Proxy(server, {
    get(target, prop) {
      if (prop === "tool" || prop === "prompt") return guard(prop);
      const value = Reflect.get(target, prop);
      // Bind to the real server: McpServer reads private fields off `this`.
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * Human-readable summary of the duplicate names, for stderr.
 *
 * Deliberately avoids the word "skipped": `<Package> skipped:` is reserved for a
 * package that failed to load at all, and release checks grep for it.
 */
export function formatDuplicates(skipped: SkippedRegistration[]): string[] {
  if (skipped.length === 0) return [];
  const byPackage = new Map<string, SkippedRegistration[]>();
  for (const entry of skipped) {
    const list = byPackage.get(entry.package) ?? [];
    list.push(entry);
    byPackage.set(entry.package, list);
  }
  const lines = [
    `⚠️  ${skipped.length} duplicate name(s) not registered (an earlier package owns them):`,
  ];
  for (const [pkg, entries] of byPackage) {
    lines.push(`  ${pkg}: ${entries.map((e) => `${e.kind} ${e.name}`).join(", ")}`);
  }
  return lines;
}
