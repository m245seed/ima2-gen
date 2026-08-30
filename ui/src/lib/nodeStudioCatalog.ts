import type { NodeCommandDescriptor } from "../components/node-canvas/NodeCommandPalette";

export const NODE_STUDIO_COMMANDS: readonly NodeCommandDescriptor[] = [
  {
    type: "image-generate",
    label: "Image generation",
    description: "Add an image node to the workflow.",
    category: "generate",
    keywords: ["image", "generate", "prompt"],
    inputPorts: [{ id: "image-input", type: "image" }],
    outputPorts: [{ id: "image-output", type: "image" }],
    createData: () => ({}),
  },
];
