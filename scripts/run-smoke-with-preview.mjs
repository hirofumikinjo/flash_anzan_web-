import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const cwd = "/Users/hirofumikinjo/Kinjo_WorkSpace/flash_anzan_web";
const preferredPort = Number(process.env.SMOKE_PORT ?? "4174");
const host = "127.0.0.1";
const smokeDevice = process.env.SMOKE_DEVICE ?? "";

function spawnCommand(command, args, extraEnv = {}) {
  return spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv
    },
    stdio: "inherit"
  });
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok || response.status === 304) {
        return;
      }
    } catch {
      // preview not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Preview server did not start in time: ${url}`);
}

async function isPortFree(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function findAvailablePort(startPort, attempts = 20) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = startPort + offset;
    if (await isPortFree(candidate)) {
      return candidate;
    }
  }
  throw new Error(`No free port found starting at ${startPort}`);
}

async function waitForExit(child, label) {
  return await new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => {
      if (code === 0 || signal === "SIGTERM") {
        resolve();
        return;
      }
      reject(new Error(`${label} failed (code=${code}, signal=${signal ?? "none"})`));
    });
    child.once("error", reject);
  });
}

async function main() {
  const port = await findAvailablePort(preferredPort);
  const baseUrl = `http://${host}:${port}/`;
  const preview = spawnCommand("npm", ["run", "preview", "--", "--host", host, "--port", String(port), "--strictPort"]);

  try {
    await waitForServer(baseUrl);

    const smoke = spawnCommand(
      "node",
      ["scripts/capture-ui-smoke.mjs"],
      {
        BASE_URL: baseUrl,
        ...(smokeDevice ? { SMOKE_DEVICE: smokeDevice } : {})
      }
    );

    await waitForExit(smoke, "Smoke capture");
  } finally {
    preview.kill("SIGTERM");
    await waitForExit(preview, "Preview server").catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
