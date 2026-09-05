#!/usr/bin/env python3
"""
Generates deliberately bad SVG paths for the MS Paint version of the site.

Hand-typing "wobbly" coordinates tends to come out too regular — the human
instinct is to make it neat. Real mouse-drawn shapes jitter, overshoot corners,
and don't quite close. This jitters every vertex and emits polylines (not
beziers) so the result is jagged rather than smooth, which is what a freehand
MS Paint stroke actually looks like.

Seeded, so the output is stable across runs.
"""
import math
import random

random.seed(20260905)

def j(n=3.0):
    return random.uniform(-n, n)

def poly(points, close=True):
    """Polyline path from points. Jagged by construction — no curve smoothing."""
    d = f"M{points[0][0]:.0f} {points[0][1]:.0f}"
    for x, y in points[1:]:
        d += f" L{x:.0f} {y:.0f}"
    if close:
        d += " Z"
    return d

def blob(cx, cy, r, n=26, wob=0.13, squash=1.0):
    """A circle drawn badly: radius wanders, start and end don't quite meet."""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        rr = r * (1 + random.uniform(-wob, wob))
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * squash))
    return poly(pts)

def box(x, y, w, h, step=16, wob=3.5):
    """Rectangle with drifting edges and corners that overshoot."""
    pts = []
    for i in range(0, w, step):
        pts.append((x + i + j(wob), y + j(wob)))
    pts.append((x + w + j(4), y + j(wob)))
    for i in range(0, h, step):
        pts.append((x + w + j(wob), y + i + j(wob)))
    pts.append((x + w + j(wob), y + h + j(4)))
    for i in range(w, 0, -step):
        pts.append((x + i + j(wob), y + h + j(wob)))
    pts.append((x + j(4), y + h + j(wob)))
    for i in range(h, 0, -step):
        pts.append((x + j(wob), y + i + j(wob)))
    return poly(pts)

def line(x1, y1, x2, y2, segs=10, wob=3.0):
    pts = []
    for i in range(segs + 1):
        t = i / segs
        pts.append((x1 + (x2 - x1) * t + j(wob), y1 + (y2 - y1) * t + j(wob)))
    return poly(pts, close=False)

def scribble_underline(x, y, w):
    """Two overlapping passes, like someone underlining with a mouse."""
    a = line(x, y, x + w, y + j(4), segs=9, wob=3.5)
    b = line(x + w, y + 4 + j(3), x + j(6), y + 5 + j(3), segs=9, wob=3.5)
    return a + " " + b

out = {}

# --- the coin: a lumpy circle with a lumpier rim ---
out["coin_outer"] = blob(100, 100, 88, n=30, wob=0.055)
out["coin_inner"] = blob(100, 100, 66, n=26, wob=0.07)

# --- frog: head, eyes, pupils, mouth. All wrong. ---
out["frog_head"] = blob(100, 104, 74, n=28, wob=0.075, squash=0.86)
out["frog_eye_l"] = blob(66, 62, 30, n=20, wob=0.10)
out["frog_eye_r"] = blob(136, 58, 27, n=20, wob=0.11)
out["frog_pupil_l"] = blob(70, 66, 11, n=14, wob=0.16)
out["frog_pupil_r"] = blob(139, 62, 10, n=14, wob=0.17)
out["frog_mouth"] = line(52, 128, 150, 132, segs=13, wob=4.5)
out["frog_nostril_l"] = blob(88, 96, 4, n=9, wob=0.3)
out["frog_nostril_r"] = blob(112, 95, 4, n=9, wob=0.3)

# --- arrow for the fee diagram ---
out["arrow_shaft"] = line(10, 40, 150, 42, segs=12, wob=3.5)
out["arrow_head"] = poly([(150, 42), (122, 20), (128, 42), (120, 63)], close=True)

# --- stick figure (a holder, receiving) ---
out["stick_head"] = blob(40, 26, 20, n=16, wob=0.12)
out["stick_body"] = line(40, 47, 41, 96, segs=7, wob=3)
out["stick_arm_l"] = line(41, 60, 10, 44, segs=6, wob=3.5)
out["stick_arm_r"] = line(41, 60, 74, 42, segs=6, wob=3.5)
out["stick_leg_l"] = line(41, 96, 16, 132, segs=6, wob=3.5)
out["stick_leg_r"] = line(41, 96, 66, 133, segs=6, wob=3.5)

# --- money bag ---
out["bag"] = poly([(30, 60), (24, 96), (30, 124), (52, 136), (82, 134), (100, 120),
                   (103, 92), (96, 62), (74, 52), (48, 54)], close=True)
out["bag_neck"] = poly([(50, 52), (44, 34), (58, 26), (78, 28), (86, 38), (80, 54)], close=True)

# --- chart line that goes up, badly ---
out["chart"] = poly([(14, 128), (44, 112), (62, 120), (92, 78), (118, 92), (150, 40), (176, 52), (196, 16)],
                    close=False)

# --- boxes and underlines ---
out["box_wide"] = box(4, 4, 320, 92)
out["box_sq"] = box(4, 4, 160, 160)
out["underline_short"] = scribble_underline(2, 10, 180)
out["underline_long"] = scribble_underline(2, 10, 420)

# --- a bad cursor, for decoration ---
out["cursor"] = poly([(4, 2), (4, 40), (14, 30), (21, 45), (28, 42), (21, 27), (33, 26)], close=True)

for k, v in out.items():
    print(f'{k}\t{v}')
