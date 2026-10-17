"""The promo's music: an airy 120 BPM bed for the cut, written as a 16-bit stereo WAV.

A pad and a plucked arpeggio (Am-F-C-G, one chord a bar, with a ping-pong echo) run throughout;
soft keyboard ticks follow the typed opening line; a soft kick, shaker, claps and ducked sub bass
come in with the pull-back to the page and drop out for the light shot; a whoosh swells into every
cut; a riser leads into a soft hit on the end card, which rings out on C major. The cues (length,
tempo, cut times, typed characters, where the drums start and stop, the drop) come from
timeline.mjs's musicCues() as JSON, so the music lands on the picture. Seeded, so every build
sounds the same.

    python promo/music.py --cues cues.json --out music.wav
"""
import argparse
import json
import wave

import numpy as np

SR = 44100
CHORDS = [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)]   # Am F C G (MIDI), a bar each
END_CHORD = (48, 55, 60, 64)                                         # C major, open
ARPEGGIO = [0, 1, 2, 1, 0, 2, 1, 2]                                  # chord tones, eighth by eighth


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def seconds(n):
    return np.arange(int(round(n * SR))) / SR


def place(track, sound, at, gain=1.0):
    i = int(round(at * SR))
    n = min(len(sound), len(track) - i)
    if n > 0:
        track[i:i + n] += gain * sound[:n]


def band(x, low=None, high=None):
    """Keeps the frequencies between low and high (Hz), with soft edges."""
    spectrum = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    gain = np.ones_like(f)
    if low:
        gain *= 1 / (1 + (low / np.maximum(f, 1e-6)) ** 4)
    if high:
        gain *= 1 / (1 + (f / high) ** 4)
    return np.fft.irfft(spectrum * gain, len(x))


def noise(rng, n):
    return rng.uniform(-1, 1, int(round(n * SR)))


def saw(freq, n, detune=0.0):
    t = seconds(n)
    return 2 * ((t * freq * (1 + detune)) % 1) - 1


def pluck(freq, decay=0.11, n=0.4):
    t = seconds(n)
    tone = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t) + 0.12 * np.sin(6 * np.pi * freq * t)
    return tone * np.exp(-t / decay) * np.minimum(1, t / 0.003)


def soft_kick():
    t = seconds(0.35)
    freq = 48 + 70 * np.exp(-t / 0.025)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.11)


def tick(rng):
    t = seconds(0.025)
    return band(noise(rng, 0.025), low=2500, high=9000) * np.exp(-t / 0.004)


def shaker(rng):
    t = seconds(0.07)
    return band(noise(rng, 0.07), low=6000) * np.exp(-t / 0.018)


def clap(rng):
    t = seconds(0.3)
    env = sum(np.where(t >= k * 0.011, np.exp(-(t - k * 0.011) / 0.006), 0) for k in range(3))
    env = env + 0.6 * np.where(t >= 0.022, np.exp(-(t - 0.022) / 0.12), 0)
    return band(noise(rng, 0.3), low=900, high=5000) * env


def whoosh(rng, rise=0.45, fall=0.05):
    """Swells over `rise` seconds and stops just after: placed to end on a cut."""
    t = seconds(rise + fall)
    env = np.where(t < rise, (t / rise) ** 3, np.clip(1 - (t - rise) / fall, 0, 1))
    return band(noise(rng, rise + fall), low=700, high=6000) * env


def echo(x, gap, feedback, taps=4):
    """Ping-pong echo: (left, right) with the odd repeats on the left, the even on the right."""
    left, right = x.copy(), x.copy()
    d = int(round(gap * SR))
    for k in range(1, taps + 1):
        shifted = np.zeros_like(x)
        shifted[k * d:] = x[:len(x) - k * d] * feedback ** k
        if k % 2:
            left += shifted
        else:
            right += shifted
    return left, right


def kick_times(cues):
    """Every beat from the pull-back to the light shot, then the drop."""
    beat = 60 / cues['bpm']
    count = int(round((cues['breakAt'] - cues['kickFrom']) / beat))
    return [cues['kickFrom'] + i * beat for i in range(count)] + [cues['drop']]


def render(cues):
    """The mix as an (n, 2) float array in -1..1."""
    rng = np.random.default_rng(7)
    length, drop = cues['length'], cues['drop']
    drums_from, drums_to = cues['kickFrom'], cues['breakAt']
    beat = 60 / cues['bpm']
    bar = 4 * beat
    n = int(round(length * SR))
    t = seconds(length)
    pad_l, pad_r, plucks, ticks, drums, shake, bass, fx = (np.zeros(n) for _ in range(8))

    # Pad: a chord a bar until the drop, then C major rings out.
    for b in range(int(np.ceil(drop / bar))):
        start = b * bar
        dur = min(bar, drop - start) + 0.3
        env = np.minimum(1, seconds(dur) / 0.2) * np.clip((dur - seconds(dur)) / 0.3, 0, 1)
        for m in CHORDS[b % 4]:
            place(pad_l, saw(hz(m - 12), dur, -0.004) * env, start, 0.05)
            place(pad_r, saw(hz(m - 12), dur, 0.004) * env, start, 0.05)
    ring = length - drop
    env = np.minimum(1, seconds(ring) / 0.05) * np.exp(-seconds(ring) / 1.2)
    for m in END_CHORD:
        place(pad_l, saw(hz(m), ring, -0.004) * env, drop, 0.06)
        place(pad_r, saw(hz(m), ring, 0.004) * env, drop, 0.06)
    pad_l, pad_r = band(pad_l, high=1400), band(pad_r, high=1400)

    # Plucks: an arpeggio in eighths, quieter under the typed line; a bell chord on the drop.
    for i in range(int(round(drop / (beat / 2)))):
        at = i * beat / 2
        chord = CHORDS[int(at // bar) % 4]
        place(plucks, pluck(hz(chord[ARPEGGIO[i % 8]] + 12)), at, 0.13 if at < drums_from else 0.17)
    for m in END_CHORD[1:]:
        place(plucks, pluck(hz(m + 12), decay=0.6, n=2.0), drop, 0.12)
    echo_l, echo_r = echo(plucks, 0.75 * beat, 0.35)

    for at in cues['typing']:
        place(ticks, tick(rng), at, 0.25)

    # Drums from the pull-back to the light shot, and the hit on the drop.
    kicks = kick_times(cues)
    for at in kicks:
        place(drums, soft_kick(), at, 0.9 if at < drop else 1.1)
    for i in range(int(round((drums_to - drums_from) / (beat / 4)))):
        place(shake, shaker(rng), drums_from + i * beat / 4, 0.1 if i % 2 else 0.05)
    for i in range(int(round(drums_from / beat)) + 4, int(round(drums_to / beat))):
        if i % 4 in (1, 3):
            place(drums, clap(rng), i * beat, 0.22)

    # Sub bass in eighths on each bar's root, ducking under the kicks with the pad.
    for i in range(int(round((drums_to - drums_from) / (beat / 2)))):
        at = drums_from + i * beat / 2
        root = CHORDS[int(at // bar) % 4][0] - 24
        root += 12 if root < 28 else 0
        nt = seconds(0.24)
        note = (np.sin(2 * np.pi * hz(root) * nt) + 0.2 * np.sin(4 * np.pi * hz(root) * nt)) * np.exp(-nt / 0.15)
        place(bass, note, at, 0.35)
    since = np.full(n, 10.0)
    for at in kicks[:-1]:
        m = t >= at
        since[m] = np.minimum(since[m], t[m] - at)
    bass *= 1 - 0.8 * np.exp(-since / 0.08)
    duck = 1 - 0.25 * np.exp(-since / 0.12)
    pad_l *= duck
    pad_r *= duck

    # A whoosh into every cut before the drop; a riser into the drop, then a sub boom and shimmer.
    for at in cues['cuts']:
        if 0.5 <= at < drop:
            place(fx, whoosh(rng), at - 0.45, 0.2)
    rise = seconds(1.0)
    ramp = (rise / rise[-1]) ** 2
    sweep = np.sin(2 * np.pi * np.cumsum(400 * 8 ** (rise / rise[-1])) / SR)
    place(fx, band(noise(rng, 1.0), low=2500) * ramp * 0.3 + sweep * ramp * 0.06, drop - 1.0)
    boom_t = seconds(1.8)
    boom = np.sin(2 * np.pi * np.cumsum(40 + 15 * np.exp(-boom_t / 0.3)) / SR) * np.exp(-boom_t / 0.9)
    place(fx, boom, drop, 0.6)
    place(fx, band(noise(rng, 2.0), low=6000) * np.exp(-seconds(2.0) / 1.4), drop, 0.25)

    core = drums + bass + fx + ticks
    left = core + pad_l + echo_l + 0.4 * shake
    right = core + pad_r + echo_r + 0.6 * shake
    mix = np.stack([left, right], axis=1)
    mix = np.tanh(1.1 * mix) / np.tanh(1.1)
    mix *= np.clip((length - t) / 0.5, 0, 1)[:, None]
    return mix * (0.89 / np.max(np.abs(mix)))


def write_wav(path, mix):
    data = (np.clip(mix, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--cues', required=True, help="JSON from timeline.mjs's musicCues()")
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    with open(args.cues, encoding='utf-8') as f:
        cues = json.load(f)
    write_wav(args.out, render(cues))
    print(f"{args.out}: {cues['length']:g} s at {cues['bpm']} BPM")


if __name__ == '__main__':
    main()
