// Builds promo/out/new-tab-promo.mp4: the music (music.py, cued from timeline.mjs), the frames
// (record.mjs), then one H.264 + AAC file, checked, and a contact sheet with one frame per shot
// (promo/out/contact.png).
// node promo/build.mjs [--scene <name>]   (--scene re-records that shot only)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpeg } from './lib/ffmpeg.mjs';
import { record, OUT, FRAMES } from './record.mjs';
import { FPS, TOTAL_FRAMES, sceneStarts, musicCues } from './timeline.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MP4 = join(OUT, 'new-tab-promo.mp4');
const WAV = join(OUT, 'music.wav');
const CUES = join(OUT, 'cues.json');
const CONTACT = join(OUT, 'contact.png');
const SECONDS = TOTAL_FRAMES / FPS;

const i = process.argv.indexOf('--scene');
const only = i > 0 ? process.argv[i + 1] : null;
mkdirSync(OUT, { recursive: true });
writeFileSync(CUES, JSON.stringify(musicCues()));
execFileSync('python', [join(HERE, 'music.py'), '--cues', CUES, '--out', WAV], { stdio: 'inherit' });
await record({ only });

const frames = readdirSync(FRAMES).filter(f => f.endsWith('.jpg')).length;
if (frames !== TOTAL_FRAMES) throw new Error(`${frames} frames in ${FRAMES}, expected ${TOTAL_FRAMES}: record every shot once without --scene`);

ffmpeg(['-y', '-loglevel', 'error',
  '-framerate', String(FPS), '-start_number', '0', '-i', join(FRAMES, '%04d.jpg'),
  '-i', WAV,
  '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-ar', '44100',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k',
  '-t', String(SECONDS), '-movflags', '+faststart', MP4]);

// The spec's checks: the length, every frame, 1920×1080 H.264, an AAC track.
const info = ffmpeg(['-i', MP4], { check: false });
const [, h, m, s] = /Duration: (\d+):(\d+):([\d.]+)/.exec(info) ?? [];
const seconds = Number(h) * 3600 + Number(m) * 60 + Number(s);
const counted = Number([...ffmpeg(['-i', MP4, '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-']).matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1]);
const problems = [
  !(Math.abs(seconds - SECONDS) <= 0.05) && `lasts ${seconds} s`,
  counted !== TOTAL_FRAMES && `has ${counted} frames`,
  !/Video: h264.*1920x1080/.test(info) && 'is not 1920×1080 H.264',
  !/Audio: aac/.test(info) && 'has no AAC audio',
].filter(Boolean);
if (problems.length) throw new Error(`${MP4} ${problems.join(', ')}`);

const picks = sceneStarts().map(sc => `eq(n,${sc.start + Math.floor((sc.frames * 3) / 4)})`).join('+');
ffmpeg(['-y', '-loglevel', 'error', '-start_number', '0', '-i', join(FRAMES, '%04d.jpg'),
  '-vf', `select='${picks}',scale=640:360,tile=3x3`, '-fps_mode', 'passthrough', '-frames:v', '1', CONTACT]);
console.log(`${MP4}: ${seconds.toFixed(2)} s, ${counted} frames\n${CONTACT}`);
