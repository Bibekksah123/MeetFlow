import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { describe, expect, it } from "vitest";

import { compressRecordingToAudio } from "./storage";

const executeFile = promisify(execFile);

describe("large recording audio preparation", () => {
  it("converts a synthetic MP4 to compact mono MP3 for transcription", async () => {
    if (!ffmpegPath) throw new Error("The worker FFmpeg binary is unavailable.");
    const directory = await mkdtemp(join(tmpdir(), "meetflow-transcription-test-"));
    const fixturePath = join(directory, "fixture.mp4");

    try {
      await executeFile(
        ffmpegPath,
        [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=1000:duration=1",
          "-c:a",
          "aac",
          "-y",
          fixturePath,
        ],
        { timeout: 15_000, windowsHide: true },
      );
      const fixture = await readFile(fixturePath);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(fixture);
          controller.close();
        },
      });
      const result = await compressRecordingToAudio(stream);

      expect(result.filename).toBe("meeting-recording.mp3");
      expect(result.mediaType).toBe("audio/mpeg");
      expect(result.audio.byteLength).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
