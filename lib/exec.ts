import { spawn } from "child_process";

export async function runCommand(
  tool: string,
  args: string[],
  timeoutMs = 120_000
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    console.log("[media-tools] exec", tool, args.join(" "));
    const child = spawn(tool, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("命令执行超时。"));
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        if (stdout.trim()) {
          console.log("[media-tools] exec stdout", stdout.trim());
        }
        if (stderr.trim()) {
          console.log("[media-tools] exec stderr", stderr.trim());
        }
        resolve({ stdout, stderr });
      } else {
        console.error("[media-tools] exec failed", stderr || `exit ${code}`);
        reject(new Error(stderr || `命令退出码 ${code}`));
      }
    });
  });
}
