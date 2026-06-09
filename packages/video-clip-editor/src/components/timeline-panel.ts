import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { MediaAsset, ProjectState, TimelineClip, TimelineTrack } from '../lib/types.js';
import { getFile } from '../lib/store.js';
import { createVideoSink, extractFramesFromSink } from '../lib/media.js';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const clipDuration = (clip: TimelineClip) => Math.max(1, clip.trimEnd - clip.trimStart);
const formatSeconds = (s: number) => {
  const m = Math.floor(Math.max(0, s) / 60).toString().padStart(2, '0');
  const sec = (Math.max(0, s) % 60).toFixed(0).padStart(2, '0');
  return `${m}:${sec}`;
};

const BASE_PPS = 50;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const FRAME_PX = 60;
const RULER_H = 22;

@customElement('timeline-panel')
export class TimelinePanel extends LitElement {
  static styles = css`
    :host {
      display: flex; flex-direction: column; flex-shrink: 0;
      background: rgba(255,255,255,0.02);
      border-top: 1px solid rgba(148,171,214,0.08); max-height: 40vh; overflow: hidden;
    }
    .panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; border-bottom: 1px solid rgba(148,171,214,0.06);
    }
    .panel-header h2 { font-size: 13px; margin: 0; }
    .actions { display: flex; gap: 6px; }
    button {
      padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(148,171,214,0.12);
      background: rgba(255,255,255,0.04); color: #c8d6e5; cursor: pointer;
      font-size: 11px; transition: background 0.15s;
    }
    button:hover { background: rgba(255,255,255,0.08); }
    .subheader { display: flex; justify-content: space-between; padding: 6px 16px; font-size: 11px; color: #6b7d99; }
    .track-list { flex: 1; overflow-y: auto; overflow-x: auto; }
    .track-row { display: flex; min-height: 48px; border-bottom: 1px solid rgba(148,171,214,0.04); }
    .track-label {
      width: 80px; flex-shrink: 0; padding: 8px; font-size: 11px;
      border-right: 1px solid rgba(148,171,214,0.06);
      display: flex; flex-direction: column; justify-content: center;
      cursor: pointer; background: rgba(255,255,255,0.01);
    }
    .track-label.muted { opacity: 0.5; }
    .track-label.disabled { opacity: 0.3; }
    .track-label strong { font-size: 12px; }
    .track-label small { color: #6b7d99; font-size: 10px; }
    .track-lane {
      flex: 1; position: relative; min-width: 0; overflow: visible;
    }
    .timeline-canvas-inner {
      position: relative; height: 100%; width: 100%; flex: 1; overflow-x: scroll;
    }
    .playhead {
      position: absolute; top: 0; width: 2px; height: 100%;
      background: #e0556a; z-index: 10; pointer-events: none;
    }
    .lane-canvas {
      display: block; width: 100%; height: 100%; border-radius: 6px;
    }
    .timeline-canvas-inner::-webkit-scrollbar { display: none; }
    .timeline-canvas-inner { scrollbar-width: none; }
    .zoom-controls { display: flex; align-items: center; gap: 4px; font-size: 11px; }
  `;

  @property({ type: Object }) project!: ProjectState;
  @property({ type: Number }) playheadSeconds = 0;
  @property({ type: Array }) assets: MediaAsset[] = [];
  @property({ type: Boolean }) isPlaying = false;

  @property({ type: Number }) _zoom = 1;
  @property({ type: String }) _selectedClipId: string | null = null;

  private _frameCache = new Map<string, { timeSeconds: number; bitmap: ImageBitmap }[]>();
  private _extracting = new Set<string>();

  private get _assetMap() {
    return new Map(this.assets.map((a) => [a.id, a]));
  }

  private get _trackMap() {
    return new Map(this.project.tracks.map((t) => [t.id, t]));
  }

  private get _pps() {
    return BASE_PPS * this._zoom;
  }

  private get _projectDuration() {
    return Math.max(20, Math.ceil(
      this.project.timelineClips.reduce((max, c) => Math.max(max, c.offsetSeconds + clipDuration(c)), 20)
    ));
  }

  private get _canvasWidth() {
    return Math.max(880, this._projectDuration * this._pps);
  }

  private _handleLaneDrop(e: DragEvent, track: TimelineTrack) {
    e.preventDefault();
    if (track.type === 'text') return;
    const assetId = e.dataTransfer?.getData('text/asset-id');
    if (!assetId) return;
    const asset = this._assetMap.get(assetId);
    if (!asset) return;

    const lane = (e.currentTarget as HTMLElement);
    const rect = lane.getBoundingClientRect();
    const offsetSec = clamp(Number(((e.clientX - rect.left) / this._pps).toFixed(2)), 0, this._projectDuration);

    const baseDuration = (asset.kind === 'video' || asset.kind === 'audio') && asset.durationSeconds
      ? Math.max(1, asset.durationSeconds) : asset.kind === 'image' ? 5 : asset.kind === 'audio' ? 10 : 4;

    const clip: TimelineClip = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      trackId: track.id,
      offsetSeconds: offsetSec,
      trimStart: 0,
      trimEnd: baseDuration,
      baseDuration,
    };

    const clips = [...this.project.timelineClips, clip];
    this.dispatchEvent(new CustomEvent('update-clips', { detail: clips, bubbles: true, composed: true }));
    this._selectedClipId = clip.id;
  }

  private _splitAtPlayhead() {
    const clip = this.project.timelineClips.find((c) => {
      const end = c.offsetSeconds + clipDuration(c);
      return this.playheadSeconds > c.offsetSeconds && this.playheadSeconds < end;
    });
    if (!clip) {
      this.dispatchEvent(new CustomEvent('message', { detail: '播放头不在任何片段内', bubbles: true, composed: true }));
      return;
    }

    const splitPoint = clip.trimStart + (this.playheadSeconds - clip.offsetSeconds);
    if (splitPoint - clip.trimStart < 0.5 || clip.trimEnd - splitPoint < 0.5) {
      this.dispatchEvent(new CustomEvent('message', { detail: '切割点太靠近边缘', bubbles: true, composed: true }));
      return;
    }

    const first: TimelineClip = {
      ...clip, id: crypto.randomUUID(),
      trimEnd: Number(splitPoint.toFixed(2)),
    };
    const second: TimelineClip = {
      ...clip, id: crypto.randomUUID(),
      offsetSeconds: this.playheadSeconds,
      trimStart: Number(splitPoint.toFixed(2)),
    };

    const clips = this.project.timelineClips.flatMap((c) =>
      c.id === clip.id ? [first, second] : [c]
    );
    this.dispatchEvent(new CustomEvent('update-clips', { detail: clips, bubbles: true, composed: true }));
    this._selectedClipId = second.id;
  }

  private get _laneHeight() {
    return 70;
  }

  updated(_changedProperties: Map<string, unknown>) {
    console.log('[timeline] updated, clips:', this.project.timelineClips.length,
      'assets:', this.assets.length, 'zoom:', this._zoom);
    this._drawCanvas();

    // Extract frames once at max density for each clip
    const track = this.project.tracks[0];
    if (!track) return;
    for (const clip of this.project.timelineClips) {
      if (clip.trackId !== track.id) continue;
      if (this._frameCache.has(clip.id) || this._extracting.has(clip.id)) continue;
      const asset = this._assetMap.get(clip.assetId ?? '');
      if (asset?.kind !== 'video') continue;

      this._extractFramesForClip(clip);
    }
  }

  private _extractFramesForClip(clip: TimelineClip) {
    this._extracting.add(clip.id);

    const asset = this._assetMap.get(clip.assetId ?? '');
    if (!asset) { this._extracting.delete(clip.id); return; }

    getFile(asset.files.original || asset.id).then((file) => {
      if (!file) { this._extracting.delete(clip.id); return; }

      const dur = clipDuration(clip);

      return createVideoSink(file).then((result) => {
        if (!result) { this._extracting.delete(clip.id); return; }
        const { sink, fps } = result;

        const frameCount = Math.max(3, Math.round(dur * 10));
        console.log('[timeline] extracting frames, videoFPS:', fps, 'count:', frameCount);

        return extractFramesFromSink(sink, clip.trimStart, clip.trimEnd, frameCount).then((frames) => {
          this._frameCache.set(clip.id, frames);
          this._extracting.delete(clip.id);
          this.requestUpdate();
        });
      });
    }).catch((e) => {
      console.error('[timeline] _extractFramesForClip failed:', e);
      this._extracting.delete(clip.id);
    });
  }

  private _handleCanvasClick(e: MouseEvent) {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const pps = this._pps;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const clickedTime = x / pps;

    if (y < RULER_H) {
      const t = clamp(Number(clickedTime.toFixed(2)), 0, this._projectDuration);
      this.dispatchEvent(new CustomEvent('playhead-change', { detail: t, bubbles: true, composed: true }));
      return;
    }

    const track = this.project.tracks[0];
    if (!track) return;

    const clickedClip = this.project.timelineClips
      .filter((c) => c.trackId === track.id)
      .find((c) => {
        const end = c.offsetSeconds + clipDuration(c);
        return clickedTime >= c.offsetSeconds && clickedTime <= end;
      });

    if (clickedClip) {
      this._selectedClipId = clickedClip.id;
      this.requestUpdate();
      return;
    }

    const t = clamp(Number(clickedTime.toFixed(2)), 0, this._projectDuration);
    this.dispatchEvent(new CustomEvent('playhead-change', { detail: t, bubbles: true, composed: true }));
  }

  private _handleWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.005;
    this._zoom = clamp(Number((this._zoom + delta).toFixed(2)), MIN_ZOOM, MAX_ZOOM);
  }

  private _drawRAF = 0;

  private _drawCanvas() {
    if (this._drawRAF) return;
    this._drawRAF = requestAnimationFrame(() => {
      this._drawRAF = 0;
      const canvas = this.renderRoot.querySelector('.lane-canvas') as HTMLCanvasElement | null;
      if (!canvas) return;
      const lane = canvas.parentElement as HTMLElement | null;
      const containerW = lane ? lane.clientWidth : 880;
      const contentW = this._canvasWidth;
      const w = Math.max(containerW, contentW);
      if (w <= 0) return;

      // Preserve playhead position ratio before resize
      const oldScrollRatio = lane ? lane.scrollLeft / Math.max(1, lane.scrollWidth) : 0;

      const dpr = window.devicePixelRatio || 1;
      const h = this._laneHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, w, h);

    const pps = this._pps;

    // Draw ruler background
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, 0, w, RULER_H);

    // Draw ruler bottom border
    ctx.strokeStyle = 'rgba(148,171,214,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_H);
    ctx.lineTo(w, RULER_H);
    ctx.stroke();

    // Draw time ticks
    const tickStep = pps >= 120 ? 1 : pps >= 60 ? 2 : pps >= 30 ? 5 : 10;
    const minorStep = tickStep / 10;
    const minorCount = Math.floor(this._projectDuration / minorStep) + 1;

    // Minor ticks (short lines)
    ctx.strokeStyle = 'rgba(148,171,214,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < minorCount; i++) {
      const t = i * minorStep;
      if (Math.abs(t % tickStep) < 0.001) continue; // skip major positions
      const x = t * pps;
      ctx.beginPath();
      ctx.moveTo(x, 16);
      ctx.lineTo(x, 21);
      ctx.stroke();
    }

    // Major ticks (longer lines + labels)
    const tickCount = Math.floor(this._projectDuration / tickStep) + 1;
    ctx.strokeStyle = 'rgba(148,171,214,0.2)';
    ctx.fillStyle = '#6b7d99';
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    for (let i = 0; i < tickCount; i++) {
      const t = i * tickStep;
      const x = t * pps;
      ctx.beginPath();
      ctx.moveTo(x, 13);
      ctx.lineTo(x, 22);
      ctx.stroke();
      ctx.fillText(formatSeconds(t), x + 3, 12);
    }

    const track = this.project.tracks[0];
    if (!track) return;
    const clips = this.project.timelineClips.filter((c) => c.trackId === track.id);
    const clipTop = RULER_H;
    const clipH = h - RULER_H - 8;
    const withFrames = clips.filter((c) => this._frameCache.has(c.id)).length;
    console.log('[timeline] _drawCanvas drawing', clips.length, 'clips,', withFrames, 'have frames');

    for (const clip of clips) {
      const dur = clipDuration(clip);
      const x = clip.offsetSeconds * pps;
      const cw = Math.max(2, dur * pps);
      const asset = this._assetMap.get(clip.assetId ?? '');
      const isVideo = asset?.kind === 'video';
      const frames = this._frameCache.get(clip.id);

      ctx.save();
      ctx.beginPath();
      const r = 6;
      this._roundRect(ctx, x, clipTop + 4, cw, clipH, r);
      ctx.clip();

      if (isVideo && frames && frames.length > 0) {
        // Draw one frame per minor tick, aligned to ruler grid
        const mainStep = pps >= 120 ? 1 : pps >= 60 ? 2 : pps >= 30 ? 5 : 10;
        const minorStep = mainStep / 10;
        const frameInterval = 0.1; // frames extracted every 0.1s
        const clipStartTime = clip.trimStart;
        const clipEndTime = clip.trimEnd;
        let t = Math.floor(clipStartTime / minorStep) * minorStep;
        while (t < clipEndTime) {
          const frameIdx = Math.round((t - clipStartTime) / frameInterval);
          if (frameIdx >= 0 && frameIdx < frames.length) {
            const fpx = x + ((t - clipStartTime) / dur) * cw;
            const fw = minorStep * pps;
            try {
              ctx.drawImage(frames[frameIdx].bitmap, fpx, clipTop + 4, Math.max(1, Math.ceil(fw)), clipH);
            } catch {
              // bitmap may be detached
            }
          }
          t += minorStep;
        }
      } else {
        const color = asset?.kind === 'video' ? 'rgba(77,150,255,0.25)' :
          asset?.kind === 'audio' ? 'rgba(74,222,128,0.25)' :
          asset?.kind === 'image' ? 'rgba(250,204,21,0.25)' :
          'rgba(148,163,184,0.25)';
        ctx.fillStyle = color;
        ctx.fillRect(x, clipTop + 4, cw, clipH);
      }

      ctx.restore();

      // Border
      ctx.strokeStyle = this._selectedClipId === clip.id ? '#4d96ff' : 'rgba(148,171,214,0.15)';
      ctx.lineWidth = this._selectedClipId === clip.id ? 2 : 1;
      ctx.beginPath();
      this._roundRect(ctx, x, clipTop + 4, cw, clipH, r);
      ctx.stroke();

      // Label
      const title = asset?.title ?? '?';
      ctx.fillStyle = '#c8d6e5';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      const label = `${title} ${formatSeconds(dur)}`;
      const textW = ctx.measureText(label).width;
      if (textW + 16 < cw) {
        ctx.fillText(label, x + 8, h / 2 + 4);
      }
    }

    // Restore scroll position after resize
    if (lane && oldScrollRatio > 0) {
      lane.scrollLeft = oldScrollRatio * lane.scrollWidth;
    }
    });
  }

  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  render() {
    const pps = this._pps;

    return html`
      <div class="panel-header">
        <h2>剪辑区 · ${this.project.timelineClips.length} 段</h2>
        <div class="actions">
          <div class="zoom-controls">
            <button @click=${() => { this._zoom = clamp(this._zoom - 0.25, MIN_ZOOM, MAX_ZOOM); }}>-</button>
            <span>${Math.round(this._zoom * 100)}%</span>
            <button @click=${() => { this._zoom = clamp(this._zoom + 0.25, MIN_ZOOM, MAX_ZOOM); }}>+</button>
          </div>
          <button @click=${() => this._splitAtPlayhead()}>切割 S</button>
        </div>
      </div>

      <div class="subheader">
        <span>${this.project.timelineClips.length} 段片段</span>
        <span>Ctrl+滚轮缩放 · 拖素材入轨 · 按 S 切割</span>
      </div>

      <div class="track-list">
        ${(() => {
          const track = this.project.tracks[0];
          if (!track) return null;
          const trackClips = this.project.timelineClips.filter((c) => c.trackId === track.id);
          if (trackClips.length === 0) return null;
          return html`
          <div class="track-row">
            <div class="track-label">
              <strong>${track.label}</strong>
              <small>视频</small>
            </div>
            <div class="track-lane"
              @dragover=${(e: DragEvent) => { e.preventDefault(); }}
              @drop=${(e: DragEvent) => this._handleLaneDrop(e, track)}
            >
              <div class="timeline-canvas-inner">
                <canvas class="lane-canvas"
                  @click=${(e: MouseEvent) => this._handleCanvasClick(e)}
                  @wheel=${(e: WheelEvent) => this._handleWheel(e)}></canvas>
                <div class="playhead" style="left:${this.playheadSeconds * pps}px"></div>
              </div>
            </div>
          </div>
          `;
        })()}
      </div>
    `;
  }
}
