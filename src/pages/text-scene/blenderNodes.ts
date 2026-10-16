import type { Object3D } from "@orillusion/core";

// glTF meshes live beneath object groups, sometimes beneath extra importer nodes.
export function findBlenderNode(root: Object3D, name: string): Object3D | undefined {
  return root.getChildByName(name, true) as Object3D | undefined;
}
