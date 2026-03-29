from __future__ import annotations

import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "public" / "sprites"


def write_png(path: Path, rows: list[list[tuple[int, int, int, int]]]) -> None:
    height = len(rows)
    width = len(rows[0]) if rows else 0
    raw = bytearray()

    for row in rows:
        raw.append(0)
        for pixel in row:
            raw.extend(pixel)

    compressed = zlib.compress(bytes(raw), level=9)

    def chunk(tag: bytes, payload: bytes) -> bytes:
        checksum = zlib.crc32(tag + payload) & 0xFFFFFFFF
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", checksum)
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n")
        handle.write(
            chunk(
                b"IHDR",
                struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0),
            )
        )
        handle.write(chunk(b"IDAT", compressed))
        handle.write(chunk(b"IEND", b""))


def scale_rows(
    data: list[str],
    palette: dict[str, str],
    pixel_width: int,
) -> list[list[tuple[int, int, int, int]]]:
    output: list[list[tuple[int, int, int, int]]] = []

    for source_row in data:
        expanded_row: list[tuple[int, int, int, int]] = []

        for token in source_row:
            rgba = to_rgba(palette.get(token))
            expanded_row.extend([rgba] * pixel_width)

        for _ in range(pixel_width):
            output.append(expanded_row.copy())

    return output


def to_rgba(color: str | None) -> tuple[int, int, int, int]:
    if color is None:
        return (0, 0, 0, 0)

    value = color.removeprefix("#")
    return (
        int(value[0:2], 16),
        int(value[2:4], 16),
        int(value[4:6], 16),
        255,
    )


SPRITES = [
    {
        "filename": "tile-key.png",
        "pixel_width": 2,
        "palette": {
            "A": "#3b2f1d",
            "B": "#f4cc62",
            "C": "#fff0b3",
            "D": "#8a6324",
        },
        "data": [
            "................",
            ".....ABBA.......",
            "....ABCCBA......",
            "....ABCCBA......",
            ".....ABBA.......",
            "........BAAA....",
            ".......ABCCAA...",
            "......ABCCAA....",
            ".....ABCCAA.....",
            ".....AAAAAAA....",
            "......AA.AA.....",
            "......AA.AA.....",
            "......AAAAA.....",
            "......AA.AA.....",
            "................",
            "................",
        ],
    },
    {
        "filename": "tile-coin.png",
        "pixel_width": 2,
        "palette": {
            "A": "#67360e",
            "B": "#e28d28",
            "C": "#ffd972",
            "D": "#fff1be",
        },
        "data": [
            "................",
            ".....ABBBB......",
            "....ABCCCCBA....",
            "...ABCDDDDCBA...",
            "...ABCDDDDCBA...",
            "...ABCDDDDCBA...",
            "...ABCDDDDCBA...",
            "...ABCDDDDCBA...",
            "...ABCDDDDCBA...",
            "...ABCDDDDCBA...",
            "...ABCDDDDCBA...",
            "...ABCDDDDCBA...",
            "....ABCCCCBA....",
            ".....ABBBB......",
            "................",
            "................",
        ],
    },
    {
        "filename": "tile-ring.png",
        "pixel_width": 2,
        "palette": {
            "A": "#143445",
            "B": "#4cc8f7",
            "C": "#d4fbff",
            "D": "#72eeff",
        },
        "data": [
            "................",
            ".....ABBBB......",
            "....ABCCCCBA....",
            "...ABCDDDDCBA...",
            "...ABDD..DDBA...",
            "...ABCD..DCBA...",
            "...ABCD..DCBA...",
            "...ABCD..DCBA...",
            "...ABCD..DCBA...",
            "...ABCD..DCBA...",
            "...ABDD..DDBA...",
            "...ABCDDDDCBA...",
            "....ABCCCCBA....",
            ".....ABBBB......",
            "................",
            "................",
        ],
    },
    {
        "filename": "tile-button.png",
        "pixel_width": 2,
        "palette": {
            "A": "#5d1f49",
            "B": "#ff79bc",
            "C": "#ffd0e6",
            "D": "#d4468d",
        },
        "data": [
            "................",
            ".....ABBBB......",
            "....ABCCCCBA....",
            "...ABCDDDDCBA...",
            "...ABCDDDDCBA...",
            "...ABDD..DDBA...",
            "...ABDD..DDBA...",
            "...ABCDDDDCBA...",
            "...ABCDDDDCBA...",
            "...ABDD..DDBA...",
            "...ABDD..DDBA...",
            "...ABCDDDDCBA...",
            "....ABCCCCBA....",
            ".....ABBBB......",
            "................",
            "................",
        ],
    },
    {
        "filename": "tile-trinket.png",
        "pixel_width": 2,
        "palette": {
            "A": "#23411d",
            "B": "#7acf51",
            "C": "#d9ffac",
            "D": "#a1ff78",
        },
        "data": [
            "................",
            ".......AA.......",
            "......ABBA......",
            "..AA..ABBA..AA..",
            ".ABBAABCCBAABBA.",
            "..ABBBCCCCCBBBA.",
            "...ABCCCCCCCBA..",
            "....ABCCCCCBA...",
            "...ABCCCCCCCBA..",
            "..ABBBCCCCCBBBA.",
            ".ABBAABCCBAABBA.",
            "..AA..ABBA..AA..",
            "......ABBA......",
            ".......AA.......",
            "................",
            "................",
        ],
    },
    {
        "filename": "crow-idle-a.png",
        "pixel_width": 2,
        "palette": {
            "A": "#131017",
            "B": "#30253d",
            "C": "#f4f2ef",
            "D": "#dba33b",
        },
        "data": [
            "................",
            "................",
            ".......AA.......",
            "......ABBA......",
            ".....ABCCBA.....",
            "....ABBBBBBBA...",
            "...ABBBBBBBBBBA.",
            "...ABBBBBBBBBBA.",
            "....ABBBBBBBA...",
            ".....ABBBBBA....",
            "......ABBDA.....",
            ".....AACCCA.....",
            ".....AA..AA.....",
            "....A....A......",
            "................",
            "................",
            "................",
        ],
    },
    {
        "filename": "crow-idle-b.png",
        "pixel_width": 2,
        "palette": {
            "A": "#131017",
            "B": "#30253d",
            "C": "#f4f2ef",
            "D": "#dba33b",
        },
        "data": [
            "................",
            "................",
            ".....AA.........",
            "....ABBA........",
            "...ABCCBA.......",
            "..ABBBBBBBA.....",
            ".ABBBBBBBBBBBA..",
            ".ABBBBBBBBBBBA..",
            "..ABBBBBBBA.....",
            "....ABBBBA......",
            "....ABBDA.......",
            "...AACCCA.......",
            "...AA..AA.......",
            "..A....A........",
            "................",
            "................",
            "................",
        ],
    },
    {
        "filename": "crow-fly.png",
        "pixel_width": 2,
        "palette": {
            "A": "#131017",
            "B": "#2e2238",
            "C": "#f4f2ef",
            "D": "#dba33b",
        },
        "data": [
            "................",
            "................",
            "AA............AA",
            "AAA..........AAA",
            ".AAAA......AAAA.",
            "..AAAABBBBAAAA..",
            "....ABBBBBBA....",
            "...ABBBBBBBBA...",
            "....ABBBBBBA....",
            "....AABBBBA.....",
            ".....ABBD.......",
            "......ACDA......",
            "......AA........",
            ".....A..A.......",
            "................",
            "................",
        ],
    },
    {
        "filename": "fx-feather.png",
        "pixel_width": 2,
        "palette": {
            "A": "#f7f1da",
            "B": "#cdbd8b",
            "C": "#7e6840",
        },
        "data": [
            ".......A",
            "......AB",
            ".....ABB",
            "....AABB",
            "...AAABB",
            "..AAABBC",
            ".AAABBC.",
            "AAABBC..",
        ],
    },
    {
        "filename": "fx-sparkle.png",
        "pixel_width": 2,
        "palette": {
            "A": "#fff4c4",
            "B": "#ffe088",
        },
        "data": [
            "....A....",
            "....A....",
            "A..AAA..A",
            ".AAAAAAA.",
            "..AABAA..",
            ".AAAAAAA.",
            "A..AAA..A",
            "....A....",
            "....A....",
        ],
    },
]


def main() -> None:
    for spec in SPRITES:
        rows = scale_rows(spec["data"], spec["palette"], spec["pixel_width"])
        write_png(OUTPUT_DIR / spec["filename"], rows)
        print(f"wrote {spec['filename']}")


if __name__ == "__main__":
    main()
