// The ffmpeg the imageio-ffmpeg pip package ships (Playwright's own build can't add audio).
import { execFileSync, spawnSync } from 'node:child_process';

let exe = null;
export const ffmpegPath = () => (exe ??= execFileSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim());

// Runs ffmpeg and returns its report (it writes to stderr); a failure throws unless check is off.
export function ffmpeg(args, { check = true } = {}) {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (check && r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
  return r.stderr;
}
