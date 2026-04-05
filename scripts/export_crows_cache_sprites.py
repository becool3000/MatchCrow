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


def make_canvas(size: int) -> list[list[str]]:
    return [["." for _ in range(size)] for _ in range(size)]


def paint_rect(
    canvas: list[list[str]],
    token: str,
    x: int,
    y: int,
    width: int,
    height: int,
) -> None:
    size = len(canvas)

    for row in range(max(0, y), min(size, y + height)):
        for col in range(max(0, x), min(size, x + width)):
            canvas[row][col] = token


def paint_ellipse(
    canvas: list[list[str]],
    token: str,
    cx: int,
    cy: int,
    rx: int,
    ry: int,
) -> None:
    size = len(canvas)
    rx2 = max(1, rx * rx)
    ry2 = max(1, ry * ry)

    for row in range(size):
        for col in range(size):
            dx = col - cx
            dy = row - cy
            if (dx * dx) / rx2 + (dy * dy) / ry2 <= 1.0:
                canvas[row][col] = token


def canvas_to_rows(
    canvas: list[list[str]],
    palette: dict[str, str],
) -> list[list[tuple[int, int, int, int]]]:
    return [
        [to_rgba(palette.get(token)) for token in row]
        for row in canvas
    ]


ENEMY_SPRITES = [
    {
        "filename": "enemies/mite.png",
        "palette": {
            "A": "#2b1721",
            "B": "#81606f",
            "C": "#d7a07e",
            "D": "#fff0aa",
            "E": "#b2e7ff",
        },
        "ops": [
            ("ellipse", "A", 16, 17, 9, 7),
            ("ellipse", "B", 16, 17, 7, 5),
            ("ellipse", "C", 9, 13, 4, 5),
            ("ellipse", "C", 23, 13, 4, 5),
            ("rect", "D", 14, 14, 2, 2),
            ("rect", "D", 18, 14, 2, 2),
            ("rect", "E", 14, 22, 1, 4),
            ("rect", "E", 17, 22, 1, 4),
        ],
    },
    {
        "filename": "enemies/midge.png",
        "palette": {
            "A": "#18202f",
            "B": "#57758c",
            "C": "#a7e8ff",
            "D": "#ffe1a1",
            "E": "#f4f0e6",
        },
        "ops": [
            ("ellipse", "A", 16, 17, 8, 6),
            ("ellipse", "B", 16, 17, 6, 4),
            ("ellipse", "C", 8, 12, 4, 6),
            ("ellipse", "C", 24, 12, 4, 6),
            ("rect", "D", 15, 13, 2, 2),
            ("rect", "E", 15, 11, 2, 1),
            ("rect", "E", 15, 20, 2, 3),
            ("rect", "E", 11, 22, 1, 3),
            ("rect", "E", 20, 22, 1, 3),
        ],
    },
    {
        "filename": "enemies/hornet.png",
        "palette": {
            "A": "#23140f",
            "B": "#8d4b3a",
            "C": "#ffd462",
            "D": "#fff0a1",
            "E": "#f2cf67",
        },
        "ops": [
            ("ellipse", "A", 16, 17, 9, 7),
            ("ellipse", "B", 16, 17, 7, 5),
            ("rect", "C", 13, 12, 6, 2),
            ("rect", "B", 13, 15, 6, 2),
            ("rect", "C", 13, 18, 6, 2),
            ("ellipse", "D", 8, 11, 4, 6),
            ("ellipse", "D", 24, 11, 4, 6),
            ("rect", "E", 15, 22, 2, 4),
        ],
    },
    {
        "filename": "enemies/wasp.png",
        "palette": {
            "A": "#28180f",
            "B": "#865734",
            "C": "#ffc85d",
            "D": "#fff1ad",
            "E": "#f1c04d",
        },
        "ops": [
            ("ellipse", "A", 16, 17, 9, 7),
            ("ellipse", "B", 16, 17, 7, 5),
            ("rect", "C", 12, 13, 8, 2),
            ("rect", "B", 12, 16, 8, 2),
            ("rect", "C", 12, 19, 8, 2),
            ("ellipse", "D", 8, 11, 4, 6),
            ("ellipse", "D", 24, 11, 4, 6),
            ("rect", "E", 15, 22, 2, 4),
            ("rect", "E", 10, 19, 2, 3),
            ("rect", "E", 20, 19, 2, 3),
        ],
    },
    {
        "filename": "enemies/grasshopper.png",
        "palette": {
            "A": "#162313",
            "B": "#4f7c39",
            "C": "#bbdf7f",
            "D": "#eaff9f",
            "E": "#92c85f",
        },
        "ops": [
            ("ellipse", "A", 16, 17, 9, 7),
            ("ellipse", "B", 16, 17, 7, 5),
            ("ellipse", "C", 10, 15, 4, 5),
            ("ellipse", "C", 22, 15, 4, 5),
            ("rect", "D", 15, 13, 2, 2),
            ("rect", "E", 8, 20, 4, 2),
            ("rect", "E", 20, 20, 4, 2),
            ("rect", "E", 11, 22, 2, 4),
            ("rect", "E", 19, 22, 2, 4),
            ("rect", "E", 15, 11, 2, 2),
        ],
    },
    {
        "filename": "enemies/frog.png",
        "palette": {
            "A": "#142118",
            "B": "#3e7246",
            "C": "#b6db81",
            "D": "#fff0b1",
            "E": "#6e9f58",
        },
        "ops": [
            ("ellipse", "A", 16, 18, 10, 8),
            ("ellipse", "B", 16, 18, 8, 6),
            ("ellipse", "C", 10, 10, 3, 3),
            ("ellipse", "C", 22, 10, 3, 3),
            ("ellipse", "D", 10, 9, 2, 2),
            ("ellipse", "D", 22, 9, 2, 2),
            ("rect", "E", 13, 22, 6, 2),
            ("rect", "E", 11, 25, 3, 2),
            ("rect", "E", 18, 25, 3, 2),
        ],
    },
    {
        "filename": "enemies/bumble-bee-queen.png",
        "palette": {
            "A": "#25180d",
            "B": "#8d6235",
            "C": "#ffcf64",
            "D": "#fff0a6",
            "E": "#f3d877",
        },
        "ops": [
            ("ellipse", "A", 16, 16, 11, 9),
            ("ellipse", "B", 16, 16, 9, 7),
            ("rect", "C", 12, 11, 8, 2),
            ("rect", "B", 12, 14, 8, 2),
            ("rect", "C", 12, 17, 8, 2),
            ("rect", "B", 12, 20, 8, 2),
            ("ellipse", "D", 8, 10, 4, 6),
            ("ellipse", "D", 24, 10, 4, 6),
            ("rect", "E", 13, 6, 2, 4),
            ("rect", "E", 17, 6, 2, 4),
            ("rect", "E", 14, 3, 4, 2),
        ],
    },
    {
        "filename": "enemies/ai-ant.png",
        "palette": {
            "A": "#151824",
            "B": "#5d637a",
            "C": "#7de7ff",
            "D": "#fef2a6",
            "E": "#b7c2da",
        },
        "ops": [
            ("ellipse", "A", 16, 16, 10, 8),
            ("ellipse", "B", 16, 16, 8, 6),
            ("ellipse", "E", 8, 13, 3, 4),
            ("ellipse", "E", 16, 13, 3, 4),
            ("ellipse", "E", 24, 13, 3, 4),
            ("rect", "C", 15, 11, 2, 2),
            ("rect", "C", 15, 15, 2, 2),
            ("rect", "D", 15, 8, 2, 2),
            ("rect", "D", 11, 5, 1, 4),
            ("rect", "D", 20, 5, 1, 4),
            ("rect", "C", 10, 22, 4, 2),
            ("rect", "C", 18, 22, 4, 2),
        ],
    },
    {
        "filename": "enemies/dark-crow.png",
        "palette": {
            "A": "#14101d",
            "B": "#453a59",
            "C": "#9f83d0",
            "D": "#fff1a0",
            "E": "#2a2136",
        },
        "ops": [
            ("ellipse", "A", 16, 16, 11, 8),
            ("ellipse", "B", 16, 16, 9, 6),
            ("ellipse", "E", 8, 12, 6, 4),
            ("ellipse", "E", 24, 12, 6, 4),
            ("rect", "C", 15, 9, 2, 2),
            ("rect", "D", 17, 12, 2, 2),
            ("rect", "C", 13, 20, 6, 3),
            ("rect", "E", 20, 7, 2, 4),
        ],
    },
]


def main() -> None:
    # Keep the existing base art untouched. This exporter now only regenerates enemies.
    for spec in ENEMY_SPRITES:
        canvas = make_canvas(32)

        for op in spec["ops"]:
            kind = op[0]

            if kind == "ellipse":
                _, token, cx, cy, rx, ry = op
                paint_ellipse(canvas, token, cx, cy, rx, ry)
            elif kind == "rect":
                _, token, x, y, width, height = op
                paint_rect(canvas, token, x, y, width, height)

        rows = canvas_to_rows(canvas, spec["palette"])
        write_png(OUTPUT_DIR / spec["filename"], rows)
        print(f"wrote {spec['filename']}")


if __name__ == "__main__":
    main()
