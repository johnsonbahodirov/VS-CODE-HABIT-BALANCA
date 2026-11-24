import { cp, rm } from "node:fs/promises";
import path from "node:path";

const distDir = path.resolve("dist");
const clientDir = path.join(distDir, "client");

await cp(clientDir, distDir, { recursive: true, force: true });
await rm(path.join(distDir, "client"), { recursive: true, force: true });
await rm(path.join(distDir, "server"), { recursive: true, force: true });
