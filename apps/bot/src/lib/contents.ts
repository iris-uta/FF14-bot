import { resolve } from "node:path";
import { loadAllContents, type Content } from "@ff14kotei/schema";

const CONTENTS_DIR = resolve(process.cwd(), "../../data/contents");

let cache: Content[] | null = null;

export function getAllContents(): Content[] {
  if (cache === null) {
    cache = loadAllContents(CONTENTS_DIR);
  }
  return cache;
}

export function getContentById(id: string): Content | undefined {
  return getAllContents().find((c) => c.id === id);
}

export function reloadContents(): void {
  cache = null;
}
