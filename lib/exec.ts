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
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`未找到 ${tool}，请确认已安装并在 PATH 中。`));
        return;
      }
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
        reject(new Error(buildCommandError(tool, stderr, code)));
      }
    });
  });
}

function buildCommandError(tool: string, stderr: string, code: number | null) {
  if (!stderr.trim()) {
    return `命令退出码 ${code ?? "未知"}`;
  }
  const message = stderr.trim();

  if (tool === "ffmpeg") {
    if (message.includes("Media type mismatch")) {
      return "FFmpeg 滤镜链音视频混接，请分离视频链与音频链。";
    }
    if (message.includes("do not match") && message.includes("SAR")) {
      return "FFmpeg concat 参数不一致，请统一 SAR（例如 setsar=1）。";
    }
    if (message.includes("do not match") && message.includes("size")) {
      return "FFmpeg concat 参数不一致，请统一分辨率/帧率/采样率。";
    }
    if (message.includes("Error reinitializing filters")) {
      return "FFmpeg 滤镜链配置失败，请检查 concat 前的统一参数设置。";
    }
    if (message.includes("Invalid argument")) {
      return "FFmpeg 参数不合法，请检查生成的命令参数。";
    }
    if (message.includes("No such file or directory")) {
      return "FFmpeg 输入文件不存在或路径不可用。";
    }
  }

  if (tool === "magick") {
    if (message.includes("no decode delegate")) {
      return "ImageMagick 无法识别输入格式，请检查文件类型。";
    }
    if (message.includes("unable to open image")) {
      return "ImageMagick 无法打开输入文件。";
    }
  }

  if (tool === "sox") {
    if (message.includes("no handler for file extension")) {
      return "SoX 不支持该文件扩展名或缺少编解码器。";
    }
    if (message.includes("can't open input file")) {
      return "SoX 无法打开输入文件。";
    }
  }

  return message;
}
