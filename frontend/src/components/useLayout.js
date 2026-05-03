import dagre from "dagre";
export function useLayout() {
  function layout(nodes, edges, direction = "TB") {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));

    g.setGraph({
      rankdir: direction,
      nodesep: 50,
      ranksep: 80,
    });

    nodes.forEach((node) => {
      g.setNode(node.id, { width: 170, height: 60 });
    });

    edges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    return nodes.map((node) => {
      const { x, y } = g.node(node.id);

      return {
        ...node,
        position: {
          x: x - 85,
          y: y - 30,
        },
      };
    });
  }

  return { layout };
}