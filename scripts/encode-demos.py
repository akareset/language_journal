"""Encode the recorded UI frames; requires Pillow (capture tooling only)."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
output = root / "docs" / "demos"
output.mkdir(parents=True, exist_ok=True)
for clip in json.loads((root / ".demo-frames" / "manifest.json").read_text()):
    frames = [Image.open(root / f["path"]).convert("RGB") for f in clip["frames"]]
    # A shared palette prevents color flicker between recorded states.
    sheet = Image.new("RGB", (240 * len(frames), 160))
    for i, frame in enumerate(frames):
        sheet.paste(frame.resize((240, 160)), (240 * i, 0))
    palette = sheet.quantize(colors=256)
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    path = output / (clip["name"] + ".gif")
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=[f["duration"] for f in clip["frames"]], loop=0, optimize=True, disposal=1)
    with Image.open(path) as result:
        duration = 0
        for index in range(result.n_frames):
            result.seek(index)
            duration += result.info["duration"]
        assert duration == 10000, (path, duration)
        assert result.size == (1200, 800)
        print(f"{path.name}: {duration / 1000:g}s, {path.stat().st_size / 1024:.0f} KiB, {result.n_frames} frames")
