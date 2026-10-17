import importlib.util
import json
import pathlib
import subprocess
import unittest

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('music', HERE.parent / 'music.py')
music = importlib.util.module_from_spec(spec)
spec.loader.exec_module(music)


def timeline_cues():
    """The cues build.mjs passes: musicCues() from timeline.mjs."""
    script = "import { musicCues } from './timeline.mjs'; console.log(JSON.stringify(musicCues()));"
    out = subprocess.run(['node', '--input-type=module', '-e', script], cwd=HERE.parent,
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class MusicTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cues = timeline_cues()
        cls.mix = music.render(cls.cues)

    def test_lasts_as_long_as_the_picture_in_stereo(self):
        self.assertEqual(self.mix.shape, (int(self.cues['length'] * music.SR), 2))

    def test_peaks_at_minus_one_dbfs(self):
        self.assertAlmostEqual(float(np.max(np.abs(self.mix))), 0.89, places=3)

    def test_kicks_land_on_the_beat_and_the_drop_on_the_end_card(self):
        times = music.kick_times(self.cues)
        for at in times:
            self.assertAlmostEqual(at * 30 % 15, 0)
        self.assertEqual(times[0], self.cues['kickFrom'])
        self.assertLess(times[-2], self.cues['breakAt'])
        self.assertEqual(times[-1], self.cues['drop'])

    def test_each_kick_is_heard(self):
        low = music.band(self.mix.mean(axis=1), high=120)
        sr = music.SR
        for at in music.kick_times(self.cues)[1:-1]:
            i = int(at * sr)
            after = np.sqrt(np.mean(low[i:i + int(0.05 * sr)] ** 2))
            before = np.sqrt(np.mean(low[i - int(0.06 * sr):i - int(0.01 * sr)] ** 2))
            self.assertGreater(after, 1.5 * before, f'kick at {at} s')

    def test_a_tick_lands_on_each_typed_character(self):
        high = music.band(self.mix.mean(axis=1), low=4000)
        sr = music.SR
        for at in self.cues['typing']:
            i = int(at * sr)
            after = np.sqrt(np.mean(high[i:i + int(0.01 * sr)] ** 2))
            before = np.sqrt(np.mean(high[i - int(0.025 * sr):i - int(0.015 * sr)] ** 2))
            self.assertGreater(after, 2 * before, f'tick at {at:.3f} s')

    def test_ends_in_silence(self):
        self.assertLess(float(np.max(np.abs(self.mix[-10:]))), 0.01)


if __name__ == '__main__':
    unittest.main()
