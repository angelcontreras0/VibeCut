import { useEffect, useRef } from "react";
import { Waveform } from "./Waveform";
import { time, clamp } from "../utils/time";
interface Props {
  duration: number;
  start: number;
  end: number;
  current: number;
  zoom: number;
  media: HTMLMediaElement;
  url: string;
  video: boolean;
  onRange: (a: number, b: number) => void;
  onSeek: (n: number) => void;
  onWaveError: () => void;
  silent?: boolean;
}
export function Timeline(p: Props) {
  const track = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const dragging = useRef<{
    side: "start" | "end";
    pointerId: number;
    offset: number;
  } | null>(null);
  useEffect(() => {
    const stop = () => {
      dragging.current = null;
      scrubbing.current = false;
    };
    window.addEventListener("blur", stop);
    return () => window.removeEventListener("blur", stop);
  }, []);
  useEffect(() => {
    const viewport = scroller.current;
    const content = track.current;
    if (!viewport || !content || scrubbing.current) return;
    const x = (p.current / p.duration) * content.offsetWidth;
    if (
      x < viewport.scrollLeft + 12 ||
      x > viewport.scrollLeft + viewport.clientWidth - 24
    ) {
      viewport.scrollLeft = Math.max(0, x - viewport.clientWidth / 2);
    }
  }, [p.current, p.duration, p.zoom]);
  function scrub(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbing.current = true;
    p.onSeek(at(e.clientX));
  }

  const at = (x: number) =>
    clamp(
      ((x - track.current!.getBoundingClientRect().left) /
        track.current!.getBoundingClientRect().width) *
        p.duration,
      0,
      p.duration,
    );
  function drag(
    e: React.PointerEvent<HTMLButtonElement>,
    side: "start" | "end",
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    scrubbing.current = false;
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = {
      side,
      pointerId: e.pointerId,
      offset: at(e.clientX) - (side === "start" ? p.start : p.end),
    };
  }
  function moveHandle(e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const state = dragging.current;
    if (!state || state.pointerId !== e.pointerId) return;
    if (!(e.buttons & 1) || !e.currentTarget.hasPointerCapture(e.pointerId)) {
      dragging.current = null;
      return;
    }
    const value = at(e.clientX) - state.offset;
    if (state.side === "start") p.onRange(clamp(value, 0, p.end - 0.01), p.end);
    else p.onRange(p.start, clamp(value, p.start + 0.01, p.duration));
  }
  function stopHandle(e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (dragging.current?.pointerId !== e.pointerId) return;
    dragging.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return (
    <div className="timeline-scroll" ref={scroller}>
      <div
        ref={track}
        className={`track ${p.video ? "" : "audio-track"}`}
        style={{ width: `${p.zoom * 100}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Posición de reproducción : arrastre para recorrer el clip"
        aria-valuemin={0}
        aria-valuemax={p.duration}
        aria-valuenow={p.current}
        aria-valuetext={time(p.current)}
        onPointerDown={scrub}
        onPointerMove={(e) => {
          if (scrubbing.current && !(e.buttons & 1)) {
            scrubbing.current = false;
            return;
          }
          if (scrubbing.current) p.onSeek(at(e.clientX));
        }}
        onPointerUp={(e) => {
          if (scrubbing.current) {
            p.onSeek(at(e.clientX));
            scrubbing.current = false;
          }
        }}
        onPointerCancel={() => {
          scrubbing.current = false;
        }}
        onLostPointerCapture={() => {
          scrubbing.current = false;
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const step = e.shiftKey ? 1 : e.altKey ? 0.001 : 1 / 30;
            p.onSeek(
              p.media.currentTime + (e.key === "ArrowRight" ? step : -step),
            );
          }
          if (e.key === "Home" || e.key === "End") {
            e.preventDefault();
            p.onSeek(e.key === "Home" ? p.start : p.end);
          }
        }}
      >
        <div className="ruler">
          {Array.from({ length: 11 }, (_, i) => (
            <span key={i}>{time((p.duration * i) / 10).slice(3, 8)}</span>
          ))}
        </div>
        {p.silent ? (
          <div className="waveform" aria-hidden="true" />
        ) : (
          <Waveform
            url={p.url}
            media={p.media}
            zoom={0}
            video={p.video}
            onError={p.onWaveError}
          />
        )}
        <div
          className="dim left"
          style={{ width: `${(p.start / p.duration) * 100}%` }}
        />
        <div
          className="dim right"
          style={{ left: `${(p.end / p.duration) * 100}%` }}
        />
        <div
          className="selection"
          style={{
            left: `${(p.start / p.duration) * 100}%`,
            width: `${((p.end - p.start) / p.duration) * 100}%`,
          }}
        />
        <button
          className="handle"
          aria-label="Inicio del corte"
          style={{ left: `${(p.start / p.duration) * 100}%` }}
          onPointerDown={(e) => drag(e, "start")}
          onPointerMove={moveHandle}
          onPointerUp={stopHandle}
          onPointerCancel={stopHandle}
          onLostPointerCapture={stopHandle}
          onDragStart={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              p.onRange(
                clamp(
                  p.start + (e.key === "ArrowRight" ? 0.01 : -0.01),
                  0,
                  p.end - 0.01,
                ),
                p.end,
              );
            }
          }}
        >
          Ⅱ
        </button>
        <button
          className="handle end"
          aria-label="Final del corte"
          style={{ left: `${(p.end / p.duration) * 100}%` }}
          onPointerDown={(e) => drag(e, "end")}
          onPointerMove={moveHandle}
          onPointerUp={stopHandle}
          onPointerCancel={stopHandle}
          onLostPointerCapture={stopHandle}
          onDragStart={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              p.onRange(
                p.start,
                clamp(
                  p.end + (e.key === "ArrowRight" ? 0.01 : -0.01),
                  p.start + 0.01,
                  p.duration,
                ),
              );
            }
          }}
        >
          Ⅱ
        </button>
        <div
          className="playhead"
          style={{ left: `${(p.current / p.duration) * 100}%` }}
        >
          <i />
        </div>
      </div>
    </div>
  );
}
