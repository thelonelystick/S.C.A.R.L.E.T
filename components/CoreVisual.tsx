"use client";

import { useEffect, useRef } from "react";
import "./core.css";

export type CoreState =
  "idle" | "listening" | "thinking" | "speaking" | "executing" | "error";
export type CoreVisualProps = {
  state?: CoreState;
  level?: number;
  className?: string;
};
type Point = { x: number; y: number; z: number };
type Dot = { x: number; y: number; size: number; phase: number };
const TAU = Math.PI * 2;
const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

function makeRandom() {
  let seed = 304781;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Coherent ripples on a sphere keep neighboring contour threads aligned.
function surface(latitude: number, longitude: number, fiber = 0): Point {
  const c = Math.cos(latitude);
  const wave =
    c *
    (0.079 * Math.sin(3 * longitude + 3 * latitude) +
      0.051 * Math.sin(6 * longitude - 4 * latitude + 1.4) +
      0.024 * Math.sin(11 * longitude + 5 * latitude) +
      0.013 * Math.sin(18 * longitude + 8 * latitude));
  const a = latitude + wave + fiber;
  const b = longitude + 0.06 * Math.sin(5 * latitude + 2 * longitude);
  const r = 1 + 0.017 * Math.sin(4 * b + 6 * a) * c + wave * 0.12;
  return {
    x: r * Math.cos(a) * Math.cos(b),
    y: r * Math.sin(a),
    z: r * Math.cos(a) * Math.sin(b),
  };
}

function makeModel() {
  const random = makeRandom();
  const parallels: Point[][] = [];
  const meridians: Point[][] = [];
  const sparks: Point[] = [];
  const veins: Point[][] = [];
  for (let i = 1; i < 66; i++) {
    const lat = -Math.PI / 2 + (i * Math.PI) / 66;
    parallels.push(
      Array.from({ length: 139 }, (_, j) => surface(lat, (j * TAU) / 138)),
    );
  }
  for (let i = 0; i < 38; i++) {
    const lon = (i * TAU) / 38;
    meridians.push(
      Array.from({ length: 66 }, (_, j) =>
        surface(-Math.PI / 2 + (j * Math.PI) / 65, lon),
      ),
    );
  }
  for (let i = 0; i < 85; i++) {
    const lat = Math.asin(random() * 1.96 - 0.98);
    const start = random() * TAU;
    const length = 0.18 + random() * 0.9;
    veins.push(
      Array.from({ length: 38 }, (_, j) =>
        surface(lat, start + (j * length) / 37),
      ),
    );
  }
  for (let i = 0; i < 1670; i++)
    sparks.push(
      surface(Math.asin(random() * 2 - 1), random() * TAU, random() * 0.009),
    );
  const stars: Dot[] = Array.from({ length: 93 }, () => ({
    x: random(),
    y: random(),
    size: 0.3 + random() * 0.8,
    phase: random() * TAU,
  }));
  return { parallels, meridians, sparks, veins, stars };
}

const motions: Record<CoreState, { speed: number; pulse: number }> = {
  idle: { speed: 0.075, pulse: 0.8 },
  listening: { speed: 0.1, pulse: 1.8 },
  thinking: { speed: 0.22, pulse: 2.4 },
  speaking: { speed: 0.12, pulse: 3.1 },
  executing: { speed: 0.28, pulse: 2.1 },
  error: { speed: 0.035, pulse: 1 },
};

export function CoreVisual({
  state = "idle",
  level = 0,
  className = "",
}: CoreVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const input = useRef({ state, level });
  useEffect(() => {
    input.current = { state, level };
  }, [state, level]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const geometry = makeModel();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let width = 0,
      height = 0,
      frame = 0,
      previous = 0,
      clock = 0,
      rotation = 0.63;
    let pointerX = 0,
      pointerY = 0,
      tiltX = 0,
      tiltY = 0;
    let lastState: CoreState | null = null;
    const accent = "#fe3b52";
    const pointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = clamp(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -1,
        1,
      );
      pointerY = clamp(
        ((event.clientY - rect.top) / rect.height) * 2 - 1,
        -1,
        1,
      );
    };
    const pointerOut = () => {
      pointerX = 0;
      pointerY = 0;
    };
    const draw = () => {
      if (width < 1 || height < 1) return;
      const { state: active, level: rawLevel } = input.current;
      const mode = motions[active] || motions.idle;
      const audio = clamp(Number.isFinite(rawLevel) ? rawLevel : 0, 0, 1);
      const pulse = (1 + Math.sin(clock * mode.pulse)) / 2;
      const talking = active === "listening" || active === "speaking";
      const radius =
        Math.min(height * 0.35, width * 0.265) *
        (1 + (talking ? audio * 0.032 : 0));
      const x = width / 2,
        y = height * 0.487;
      if (radius < 2) return;
      const radial = (
        cx: number,
        cy: number,
        r: number,
        colors: [number, string][],
      ) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        for (const [stop, color] of colors) g.addColorStop(stop, color);
        return g;
      };
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = radial(x, y, radius * 2.35, [
        [0, "rgba(163,12,36,.21)"],
        [0.5, "rgba(117,6,27,.15)"],
        [1, "rgba(102,0,23,0)"],
      ]);
      ctx.fillRect(0, 0, width, height);
      for (const dot of geometry.stars) {
        const px = dot.x * width,
          py = dot.y * height;
        ctx.fillStyle =
          "rgba(255,122,140," +
          (0.2 + 0.14 * Math.sin(dot.phase + clock * 0.4)) +
          ")";
        ctx.fillRect(px, py, dot.size, dot.size);
      }
      ctx.save();
      ctx.translate(x, y);
      const orbit = (
        rx: number,
        ry: number,
        angle: number,
        color: string,
        start = 0,
        end = TAU,
        weight = 0.75,
      ) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = weight;
        ctx.ellipse(0, 0, rx * radius, ry * radius, angle, start, end);
        ctx.stroke();
      };
      // Interrupted instrument arcs have an independent axis from the reactor.
      const spin = clock * (active === "executing" ? 0.48 : 0.055);
      ctx.setLineDash([2, 6]);
      orbit(1.27, 1.27, 0, "rgba(255,88,117,.24)", -2.9 + spin, -1.35 + spin);
      orbit(1.27, 1.27, 0, "rgba(255,88,117,.22)", 0.16 + spin, 1.78 + spin);
      ctx.setLineDash([]);
      orbit(1.19, 1.19, 0, "rgba(248,63,96,.34)", 3.5 + spin, 4.31 + spin);
      orbit(1.19, 1.19, 0, "rgba(248,63,96,.29)", 0.65 + spin, 1.15 + spin);
      orbit(1.88, 0.35, -0.14, "rgba(255,64,86,.36)", Math.PI, TAU);
      orbit(1.61, 0.58, -0.38, "rgba(248,53,88,.20)", Math.PI, TAU);
      ctx.fillStyle = radial(0, 0, radius * 1.18, [
        [0, "rgba(103,10,24,.3)"],
        [0.78, "rgba(153,13,34,.2)"],
        [0.875, "rgba(255,37,58,.16)"],
        [1, "rgba(229,24,56,0)"],
      ]);
      ctx.fillRect(
        -1.19 * radius,
        -1.19 * radius,
        radius * 2.38,
        radius * 2.38,
      );
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.987, 0, TAU);
      ctx.fillStyle = radial(-radius * 0.23, -radius * 0.25, radius * 1.61, [
        [0, "#57212b"],
        [0.34, "#49101e"],
        [0.65, "#290b14"],
        [1, "#120a0d"],
      ]);
      ctx.fill();

      const lon = rotation + tiltX,
        ca = Math.cos(lon),
        sa = Math.sin(lon);
      const pitch = -0.16 + tiltY,
        cp = Math.cos(pitch),
        sp = Math.sin(pitch);
      const roll = -0.27,
        cr = Math.cos(roll),
        sr = Math.sin(roll);
      // Orthographic basis shared by every vertex. Avoid allocations in the render loop.
      const xx = ca * cr + sa * sp * sr,
        xy = -cp * sr,
        xz = sa * cr - ca * sp * sr;
      const yx = ca * sr - sa * sp * cr,
        yy = cp * cr,
        yz = sa * sr + ca * sp * cr;
      const zx = -sa * cp,
        zy = -sp,
        zz = ca * cp;
      const thread = (pts: Point[], near: boolean) => {
        let pen = false;
        for (const p of pts) {
          const depth = p.x * zx + p.y * zy + p.z * zz;
          if (depth >= -0.025 !== near) {
            pen = false;
            continue;
          }
          const px = radius * (p.x * xx + p.y * xy + p.z * xz),
            py = radius * (p.x * yx + p.y * yy + p.z * yz);
          if (pen) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          pen = true;
        }
      };
      const threads = (
        lines: Point[][],
        color: string | CanvasGradient,
        weight: number,
        near = true,
      ) => {
        ctx.beginPath();
        for (const line of lines) thread(line, near);
        ctx.strokeStyle = color;
        ctx.lineWidth = weight;
        ctx.stroke();
      };
      const surfaceLight = ctx.createLinearGradient(
        -radius * 0.9,
        -radius,
        radius * 0.95,
        radius * 0.94,
      );
      surfaceLight.addColorStop(0, "rgba(255,168,146,.91)");
      surfaceLight.addColorStop(0.35, "rgba(255,73,89,.86)");
      surfaceLight.addColorStop(0.68, "rgba(234,35,63,.52)");
      surfaceLight.addColorStop(1, "rgba(255,90,102,.88)");
      const stroke = clamp(radius / 133, 0.55, 0.95);
      threads(geometry.parallels, "rgba(224,46,72,.12)", stroke, false);
      threads(geometry.meridians, "rgba(250,64,84,.30)", stroke * 0.72);
      threads(geometry.parallels, surfaceLight, stroke);
      threads(geometry.veins, "rgba(255,108,109,.88)", stroke * 1.55);
      for (let i = 0; i < geometry.sparks.length; i++) {
        const p = geometry.sparks[i];
        const z = p.x * zx + p.y * zy + p.z * zz;
        if (z < -0.055) continue;
        const px = radius * (p.x * xx + p.y * xy + p.z * xz),
          py = radius * (p.x * yx + p.y * yy + p.z * yz);
        const size = i % 13 === 0 ? 1.35 : 0.75;
        ctx.fillStyle = i % 13 === 0 ? "#ffc0ac" : "#fa5868";
        ctx.fillRect(px, py, size * stroke, size * stroke);
      }
      // Broad tilted equatorial orbital track; particles move along its visible side.
      orbit(1.88, 0.35, -0.14, "rgba(250,69,91,.47)", 0, Math.PI);
      orbit(1.61, 0.58, -0.38, "rgba(255,101,113,.36)", 0, Math.PI);
      const phase = (clock * 0.2 + 0.3) % TAU;
      const ox = 1.88 * radius * Math.cos(phase),
        oy = 0.35 * radius * Math.sin(phase);
      const sx = ox * Math.cos(-0.14) - oy * Math.sin(-0.14),
        sy = ox * Math.sin(-0.14) + oy * Math.cos(-0.14);
      const flare = (fx: number, fy: number, s: number) => {
        ctx.fillStyle = radial(fx, fy, s, [
          [0, "#fff0df"],
          [0.1, "#ffa9a1"],
          [0.26, "rgba(255,66,81,.8)"],
          [0.52, "rgba(255,45,66,.24)"],
          [1, "rgba(255,17,54,0)"],
        ]);
        ctx.fillRect(fx - s, fy - s, 2 * s, 2 * s);
      };
      if (Math.sin(phase) > 0 || Math.hypot(sx, sy) > radius)
        flare(sx, sy, 5.4);
      flare(-radius * 0.84, -radius * 0.55, radius * 0.145);
      if (active === "thinking" || active === "executing") {
        orbit(
          1.1 + pulse * 0.03,
          1.1 + pulse * 0.03,
          spin * 3,
          accent,
          0,
          Math.PI * 0.42,
          1.5,
        );
        orbit(
          1.1 + pulse * 0.03,
          1.1 + pulse * 0.03,
          spin * 3,
          accent,
          Math.PI,
          Math.PI * 1.42,
          1.5,
        );
      }
      if (talking) {
        ctx.strokeStyle = "rgba(255,107,123,.67)";
        ctx.beginPath();
        for (let i = 0; i <= 204; i++) {
          const a = (TAU * i) / 204;
          const wave =
            Math.sin(a * 12 + clock * 4) * Math.sin(a * 5 - clock * 2);
          const r = radius * (1.12 + (0.015 + audio * 0.14) * wave);
          if (i === 0) ctx.moveTo(r * Math.cos(a), r * Math.sin(a));
          else ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
        }
        ctx.lineWidth = 1.15;
        ctx.stroke();
      } else if (active === "error") {
        orbit(
          1.095,
          1.095,
          0,
          "rgba(255,172,83," + (0.42 + pulse * 0.32) + ")",
          -2.35,
          -1.88,
          2,
        );
      }
      ctx.restore();
    };
    const animate = (now: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      const active = input.current.state;
      if (reduced.matches) {
        if (lastState !== active) {
          draw();
          lastState = active;
        }
      } else if (!previous || now - previous >= 1000 / 30 - 0.6) {
        const elapsed = previous ? Math.min((now - previous) / 1000, 0.09) : 0;
        previous = now;
        clock += elapsed;
        rotation += elapsed * (motions[active] || motions.idle).speed;
        tiltX += (pointerX * 0.3 - tiltX) * 0.09;
        tiltY += (pointerY * 0.16 - tiltY) * 0.09;
        draw();
      }
      if (!reduced.matches) frame = requestAnimationFrame(animate);
    };
    const refresh = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      lastState = null;
      if (visible && !document.hidden) frame = requestAnimationFrame(animate);
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      refresh();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const inView = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      refresh();
    });
    inView.observe(canvas);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerleave", pointerOut);
    canvas.addEventListener("scarlet-core-update", refresh);
    document.addEventListener("visibilitychange", refresh);
    reduced.addEventListener("change", refresh);
    resize();
    return () => {
      observer.disconnect();
      inView.disconnect();
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerleave", pointerOut);
      canvas.removeEventListener("scarlet-core-update", refresh);
      document.removeEventListener("visibilitychange", refresh);
      reduced.removeEventListener("change", refresh);
    };
  }, []);

  useEffect(() => {
    // A static reduced-motion frame should still reflect a changed system state.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      canvasRef.current?.dispatchEvent(new Event("scarlet-core-update"));
    }
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      className={"scarlet-core-visual " + className}
      role="img"
      aria-label={"Holographic Scarlet reactor, " + state}
    >
      Scarlet reactor, {state}
    </canvas>
  );
}

export default CoreVisual;
