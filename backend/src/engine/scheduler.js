/**
 * Build the in-memory DAG (adjacency list + indegree map) from a parsed DSL.
 * Returns: { adj: Map<name, string[]>, indegree: Map<name, number>,
 *            byName: Map<name, NodeDef>, roots: string[] }
 */
export function buildDag(parsed) {
  const adj = new Map();
  const indegree = new Map();
  const byName = new Map();
  for (const n of parsed.nodes) {
    adj.set(n.name, []);
    indegree.set(n.name, 0);
    byName.set(n.name, n);
  }
  for (const e of parsed.edges) {
    adj.get(e.from).push(e.to);
    indegree.set(e.to, indegree.get(e.to) + 1);
  }
  const roots = [...indegree].filter(([, d]) => d === 0).map(([n]) => n);
  return { adj, indegree, byName, roots };
}
