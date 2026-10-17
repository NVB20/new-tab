// The promo, shot by shot: 22 s at 30 fps, cut to a 120 BPM beat (a beat is 15 frames). The music
// takes its cues from here too (musicCues), so picture and sound land together.

export const FPS = 30;
export const BPM = 120;
export const BEAT = (FPS * 60) / BPM;
export const CHAR_FRAMES = 1.4;   // the typed line's speed

const frame = type => `.widget-frame.frame-${type}`;
const copy = id => `.widget-frame[data-id="${id}"]`;
const HEATMAP = `${frame('github')} .gh-heatmap`;

// Each shot: name; frames, its length. Optional:
//   group      the tab the page opens on (fixtures/state.mjs)
//   layoutMode opened in Layout mode
//   stage      'dark' or 'light': a glowing backdrop over the page (the page shows otherwise)
//   glow       the stage's blue glow over a shot of the page
//   depth      blur the page's edges, clear around the camera's subject
//   camera     keys { f, focus, zoom, rx, ry, at }: the focus element's centre goes to the point
//              at ('center' or [x, y]), scaled by zoom and tilted rx/ry degrees; eased between keys
//   words      cues { f, text, at: 'top' | 'center' | 'left', to?, size?, type? }; *starred* words
//              are in the blue gradient; to: when it leaves; type: frames per typed character
//   cloud      tiles (a selector) floating blurred around the edges
//   float      widgets lifted onto the stage { sel, f, x, y, scale, rx?, ry? } (centre in px)
//   brackets   corner brackets closing in on the first floating widget at frame f
//   logo       { f, pill, pillF, dark? }: the icon and name, then a pill (dark: a dark pill)
//   curves     thin arcs drawing in on the stage
//   cursor     pointer keys { f, x, y } or { f, sel }, hide: gone from that key on
//   drags      { from, to, sel, by: [cols, rows] } or { from, to, sel, onto: selector }
//   fx         'sparklines' (the floating Markets lines draw in) or 'heatmap' (the map fills in)
export const SCENES = [
  {
    name: 'hook', frames: 5 * BEAT, stage: 'dark', cloud: `${frame('tiles')} .tile`,
    words: [{ f: 3, text: 'Still opening *ten tabs* every morning?', at: 'center', type: CHAR_FRAMES }],
  },
  {
    name: 'meet', frames: 3 * BEAT, stage: 'dark',
    words: [{ f: 0, to: BEAT, text: 'Meet', at: 'center', size: 'xl' }],
    logo: { f: BEAT, pill: '✦ Your whole morning on one page', pillF: 2 * BEAT },
  },
  {
    name: 'tiles', frames: 6 * BEAT, glow: true, depth: true,
    camera: [
      { f: 0, focus: copy('w-tiles') + ' .tile[data-id="t-github"]', zoom: 3, at: 'center' },
      { f: 10, focus: copy('w-tiles') + ' .tile[data-id="t-github"]', zoom: 2.8, at: 'center' },
      { f: 3 * BEAT, focus: '#canvas', zoom: 0.8, rx: 16, ry: -14, at: [960, 620] },
      { f: 6 * BEAT - 1, focus: '#canvas', zoom: 0.76, rx: 13, ry: -9, at: [960, 620] },
    ],
    cursor: [{ f: 0, x: 975, y: 560 }, { f: 9, x: 990, y: 575 }, { f: 12, x: 990, y: 575, hide: true }],
    words: [{ f: 3 * BEAT, text: 'Every site, *one click*', at: 'top' }],
  },
  {
    name: 'markets', frames: 6 * BEAT, stage: 'dark', fx: 'sparklines',
    float: [{ sel: frame('markets'), f: 0, x: 1250, y: 560, scale: 1.15, ry: -12 }],
    brackets: { f: BEAT },
    words: [{ f: 0, text: 'Live *markets*', at: 'left' }],
  },
  {
    name: 'github', frames: 6 * BEAT, glow: true, depth: true, fx: 'heatmap',
    camera: [
      { f: 0, focus: HEATMAP, zoom: 2.2, rx: 20, ry: 0, at: [960, 650] },
      { f: 6 * BEAT - 1, focus: HEATMAP, zoom: 2.5, rx: 14, ry: -5, at: [960, 640] },
    ],
    words: [{ f: BEAT, text: 'Your *GitHub*, at a glance', at: 'top' }],
  },
  {
    name: 'cards', frames: 5 * BEAT, stage: 'dark',
    float: [
      { sel: frame('sports'), f: 0, x: 690, y: 610, scale: 1.05, ry: 10 },
      { sel: frame('weather'), f: 8, x: 1230, y: 610, scale: 1.05, ry: -10 },
    ],
    words: [{ f: 0, text: 'Scores.', at: 'top' }, { f: BEAT, text: '*Weather.*', at: 'top' }],
  },
  {
    name: 'layout', frames: 5 * BEAT, group: 'g-work', layoutMode: true, glow: true,
    camera: [
      { f: 0, focus: '#canvas', zoom: 0.86, at: [960, 610] },
      { f: 5 * BEAT - 1, focus: '#canvas', zoom: 0.84, at: [960, 610] },
    ],
    drags: [
      { from: 0, to: 12, sel: copy('w2-weather'), by: [2, 4] },
      { from: 2 * BEAT, to: 2 * BEAT + 14, sel: copy('w2-sports'), onto: copy('w2-weather') },
    ],
    words: [{ f: 0, text: 'Make it *yours*', at: 'top' }],
  },
  {
    name: 'light', frames: 4 * BEAT, stage: 'light', curves: true,
    words: [{ f: 0, text: 'No account.', at: 'center' }, { f: BEAT, text: '*Free.*', at: 'center' }],
  },
  {
    name: 'end', frames: 4 * BEAT, stage: 'light', curves: true,
    logo: { f: 0, pill: 'Free for Chrome', pillF: BEAT, dark: true },
  },
];

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.frames, 0);

// The shots with start, each one's first frame in the whole video.
export function sceneStarts() {
  let at = 0;
  return SCENES.map(s => {
    const start = at;
    at += s.frames;
    return { ...s, start };
  });
}

// What music.py needs to land on the picture, in seconds: where the drums come in (the pull-back to
// the page) and drop out (the light shot), the drop (the end card), every cut, and each typed
// character of the opening line.
export function musicCues() {
  const shots = sceneStarts();
  const at = name => shots.find(s => s.name === name).start / FPS;
  const hook = shots.find(s => s.name === 'hook');
  const typed = hook.words.find(w => w.type);
  return {
    length: TOTAL_FRAMES / FPS,
    bpm: BPM,
    kickFrom: at('tiles'),
    breakAt: at('light'),
    drop: at('end'),
    cuts: shots.slice(1).map(s => s.start / FPS),
    typing: [...typed.text.replaceAll('*', '')].flatMap((ch, i) => (ch === ' ' ? [] : [(hook.start + typed.f + i * typed.type) / FPS])),
  };
}
