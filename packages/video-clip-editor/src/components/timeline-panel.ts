import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { MediaAsset, ProjectState, TimelineClip, TimelineTrack } from '../lib/types.js';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const clipDuration = (clip: TimelineClip) => Math.max(1, clip.trimEnd - clip.trimStart);
const formatSeconds = (s: number) => {
  const m = Math.floor(Math.max(0, s) / 60).toString().padStart(2, '0');
  const sec = (Math.max(0, s) % 60).toFixed(0).padStart(2, '0');
  return `${m}:${sec}`;
};

const BASE_PPS = 28;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

@customElement('timeline-panel')
export class TimelinePanel extends LitElement {
  static styles = css`
    :host {
      display: flex; flex-direction: column; background: rgba(255,255,255,0.02);
      border-top: 1px solid rgba(148,171,214,0.08); min-height: 200px; max-height: 360px; overflow: hidden;
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
      position: relative; height: 100%;
    }
    .ruler {
      height: 22px; position: relative; border-bottom: 1px solid rgba(148,171,214,0.06);
      cursor: pointer;
    }
    .ruler-tick {
      position: absolute; top: 4px; font-size: 9px; color: #6b7d99;
    }
    .playhead {
      position: absolute; top: 0; width: 2px; height: 100%;
      background: #e0556a; z-index: 10; pointer-events: none;
    }
    .clip-bar {
      position: absolute; top: 4px; bottom: 4px; border-radius: 6px;
      cursor: pointer; border: 1px solid transparent; overflow: hidden;
      display: flex; align-items: center; padding: 0 8px; gap: 6px;
      font-size: 11px; transition: border-color 0.15s;
    }
    .clip-bar.clip-video { background: rgba(77,150,255,0.2); }
    .clip-bar.clip-audio { background: rgba(74,222,128,0.2); }
    .clip-bar.clip-image { background: rgba(250,204,21,0.2); }
    .clip-bar.clip-text { background: rgba(216,180,254,0.2); }
    .clip-bar.clip-other { background: rgba(148,163,184,0.2); }
    .clip-bar.active { border-color: #4d96ff; }
    .clip-bar strong {
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      font-weight: 500;
    }
    .empty-lane { padding: 12px 16px; font-size: 11px; color: #6b7d99; }
    .zoom-controls { display: flex; align-items: center; gap: 4px; font-size: 11px; }
  `;

  @property({ type: Object }) project!: ProjectState;
  @property({ type: Number }) playheadSeconds = 0;
  @property({ type: Array }) assets: MediaAsset[] = [];
  @property({ type: Boolean }) isPlaying = false;

  @property({ type: Number }) _zoom = 2;
  @property({ type: String }) _selectedClipId: string | null = null;

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

  private _handleRulerClick(e: MouseEvent, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this._pps;
    const t = clamp(Number(x.toFixed(2)), 0, this._projectDuration);
    this.dispatchEvent(new CustomEvent('playhead-change', { detail: t, bubbles: true, composed: true }));
  }

  private _addTrack(type: string) {
    const prefix = type === 'video' ? 'V' : type === 'audio' ? 'A' : 'T';
    const maxIdx = this.project.tracks
      .filter((t) => t.type === type)
      .reduce((m, t) => Math.max(m, parseInt(t.id.slice(1)) || 0), 0);
    const newTrack: TimelineTrack = {
      id: `${prefix}${maxIdx + 1}`,
      label: `${prefix}${maxIdx + 1}`,
      type: type as TimelineTrack['type'],
      muted: false,
      disabled: false,
    };
    const tracks = [...this.project.tracks, newTrack];
    this.dispatchEvent(new CustomEvent('update-tracks', { detail: tracks, bubbles: true, composed: true }));
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

  render() {
    const pps = this._pps;
    const canvasW = this._canvasWidth;
    const tickStep = pps >= 84 ? 1 : pps >= 42 ? 2 : pps >= 24 ? 5 : 10;

    return html`
      <div class="panel-header">
        <h2>多轨剪辑区 · ${this.project.timelineClips.length} 段</h2>
        <div class="actions">
          <div class="zoom-controls">
            <button @click=${() => { this._zoom = clamp(this._zoom - 0.25, MIN_ZOOM, MAX_ZOOM); }}>-</button>
            <span>${Math.round(this._zoom * 100)}%</span>
            <button @click=${() => { this._zoom = clamp(this._zoom + 0.25, MIN_ZOOM, MAX_ZOOM); }}>+</button>
          </div>
          <button @click=${() => this._splitAtPlayhead()}>切割 S</button>
          <button @click=${() => this._addTrack('video')}>+ 视频轨</button>
          <button @click=${() => this._addTrack('audio')}>+ 音频轨</button>
          <button @click=${() => this._addTrack('text')}>+ 文本轨</button>
        </div>
      </div>

      <div class="subheader">
        <span>${this.project.timelineClips.length} 段片段</span>
        <span>Ctrl+滚轮缩放 · 拖素材入轨 · 按 S 切割</span>
      </div>

      <div class="track-list">
        <div class="ruler" @click=${(e: MouseEvent) => this._handleRulerClick(e, e.currentTarget as HTMLElement)}>
          <div style="position:relative;width:${canvasW}px;height:100%">
            ${Array.from({ length: Math.floor(this._projectDuration / tickStep) + 1 }).map((_, i) => {
              const t = i * tickStep;
              return html`<span class="ruler-tick" style="left:${t * pps}px">${formatSeconds(t)}</span>`;
            })}
            <div class="playhead" style="left:${this.playheadSeconds * pps}px"></div>
          </div>
        </div>

        ${this.project.tracks.map((track) => html`
          <div class="track-row">
            <div class="track-label ${track.muted ? 'muted' : ''} ${track.disabled ? 'disabled' : ''}">
              <strong>${track.label}</strong>
              <small>${track.type === 'video' ? '视频' : track.type === 'audio' ? '音频' : '文本'}</small>
            </div>
            <div class="track-lane"
              @dragover=${(e: DragEvent) => { e.preventDefault(); }}
              @drop=${(e: DragEvent) => this._handleLaneDrop(e, track)}
            >
              <div class="timeline-canvas-inner" style="width:${canvasW}px;height:100%"
                @click=${(e: MouseEvent) => this._handleRulerClick(e, e.currentTarget as HTMLElement)}
              >
                <div class="playhead" style="left:${this.playheadSeconds * pps}px"></div>
                ${this.project.timelineClips
                  .filter((c) => c.trackId === track.id)
                  .map((clip) => {
                    const asset = this._assetMap.get(clip.assetId ?? '');
                    const clipKind = track.type === 'text' ? 'text'
                      : asset?.kind === 'video' ? 'video'
                      : asset?.kind === 'audio' ? 'audio'
                      : asset?.kind === 'image' ? 'image'
                      : 'other';
                    const title = track.type === 'text' ? (clip.text ?? '文字') : (asset?.title ?? '?');
                    const dur = clipDuration(clip);

                    return html`
                      <div
                        class="clip-bar clip-${clipKind} ${this._selectedClipId === clip.id ? 'active' : ''}"
                        style="left:${clip.offsetSeconds * pps}px;width:${Math.max(56, dur * pps)}px"
                        @click=${(e: MouseEvent) => {
                          e.stopPropagation();
                          this._selectedClipId = clip.id;
                        }}
                      >
                        <strong>${title}</strong>
                        <span style="font-size:10px;color:#6b7d99">${formatSeconds(dur)}</span>
                      </div>
                    `;
                  })}
                ${this.project.timelineClips.filter((c) => c.trackId === track.id).length === 0 ? html`
                  <div class="empty-lane">拖素材到这里</div>
                ` : null}
              </div>
            </div>
          </div>
        `)}
      </div>
    `;
  }
}
