import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { createRef, ref } from 'lit/directives/ref.js';
import type { MediaAsset, ProjectState, TimelineClip } from '../lib/types.js';
import { getFile } from '../lib/store.js';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const clipDuration = (clip: TimelineClip) => Math.max(1, clip.trimEnd - clip.trimStart);

@customElement('preview-canvas')
export class PreviewCanvas extends LitElement {
  static styles = css`
    :host {
      display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;
    }
    .stage {
      flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center;
      overflow: hidden; background: #000;
    }
    .stage video {
      max-width: 100%; max-height: 100%; display: block; background: #000;
    }
    .stage-placeholder { color: #555; font-size: 14px; position: absolute; }
  `;

  @property({ type: Object }) project!: ProjectState;
  @property({ type: Number }) playheadSeconds = 0;
  @property({ type: Boolean }) isPlaying = false;
  @property({ type: Array }) assets: MediaAsset[] = [];
  @property({ type: String }) busyAssetId: string | null = null;

  private _videoRef = createRef<HTMLVideoElement>();
  private _activeClip: TimelineClip | null = null;
  private _activeAssetId: string | null = null;
  private _blobUrl: string | null = null;
  private _syncing = false;
  private _loadingVideo = false;

  private get _assetMap() {
    return new Map(this.assets.map((a) => [a.id, a]));
  }

  updated() {
    console.log('[preview] updated, isPlaying:', this.isPlaying, 'loadingVideo:', this._loadingVideo,
      'assets:', this.assets.length, 'clips:', this.project.timelineClips.length);
    if (!this.isPlaying && !this._loadingVideo) {
      this._syncCurrentTime(this.playheadSeconds);
    }
  }

  private _findActiveClip(playhead: number): { clip: TimelineClip; asset: MediaAsset } | null {
    for (const clip of this.project.timelineClips) {
      const end = clip.offsetSeconds + clipDuration(clip);
      if (playhead >= clip.offsetSeconds && playhead <= end) {
        const asset = this._assetMap.get(clip.assetId ?? '');
        if (asset?.kind === 'video') return { clip, asset };
      }
    }
    return null;
  }

  private async _loadSrc(asset: MediaAsset) {
    console.log('[preview] _loadSrc, assetId:', asset.id, 'activeAssetId:', this._activeAssetId, 'hasBlobUrl:', !!this._blobUrl);
    if (this._activeAssetId === asset.id && this._blobUrl) return;
    if (this._blobUrl) { URL.revokeObjectURL(this._blobUrl); this._blobUrl = null; }
    const file = await getFile(asset.files.original || asset.id);
    console.log('[preview] _loadSrc got file:', !!file);
    if (!file) return;
    this._blobUrl = URL.createObjectURL(file);
    this._activeAssetId = asset.id;
    console.log('[preview] _loadSrc videoRef:', !!this._videoRef.value);
    if (!this._videoRef.value) return;
    this._videoRef.value.src = this._blobUrl;
    console.log('[preview] _loadSrc video.src set');
  }

  private async _syncCurrentTime(playhead: number) {
    const video = this._videoRef.value;
    console.log('[preview] _syncCurrentTime, playhead:', playhead, 'hasVideo:', !!video, 'syncing:', this._syncing);
    if (!video || this._syncing) return;
    const active = this._findActiveClip(playhead);
    console.log('[preview] _syncCurrentTime active:', !!active);
    if (!active) {
      this._activeClip = null;
      if (this._blobUrl) { URL.revokeObjectURL(this._blobUrl); this._blobUrl = null; this._activeAssetId = null; }
      return;
    }
    this._loadingVideo = true;
    try {
      await this._loadSrc(active.asset);
      const v = this._videoRef.value;
      if (!v) { console.log('[preview] _syncCurrentTime video ref lost after loadSrc'); return; }
      this._activeClip = active.clip;
      const st = clamp(active.clip.trimStart + (playhead - active.clip.offsetSeconds), 0, active.clip.trimEnd);
      console.log('[preview] _syncCurrentTime seek to:', st);
      if (Math.abs(v.currentTime - st) > 0.2) {
        v.currentTime = st;
      }
    } finally {
      this._loadingVideo = false;
    }
  }

  render() {
    const active = this._findActiveClip(this.playheadSeconds);
    console.log('[preview] render, playhead:', this.playheadSeconds, 'hasActive:', !!active,
      'clips:', this.project.timelineClips.length, 'assets:', this.assets.length);

    return html`
      <div class="stage">
        ${active ? html`
          <video
            ${ref(this._videoRef)}
            controls
            muted
            preload="auto"
            @play=${() => {
              this.dispatchEvent(new CustomEvent('playing-change', { detail: true, bubbles: true, composed: true }));
            }}
            @pause=${() => {
              this.dispatchEvent(new CustomEvent('playing-change', { detail: false, bubbles: true, composed: true }));
            }}
            @timeupdate=${() => {
              const video = this._videoRef.value;
              if (!video || !this._activeClip) return;
              this._syncing = true;
              const timelineTime = this._activeClip.offsetSeconds + (video.currentTime - this._activeClip.trimStart);
              if (video.currentTime >= this._activeClip.trimEnd) {
                video.pause();
                this.dispatchEvent(new CustomEvent('playhead-change', { detail: this._activeClip.offsetSeconds + clipDuration(this._activeClip), bubbles: true, composed: true }));
              } else {
                this.dispatchEvent(new CustomEvent('playhead-change', { detail: Number(timelineTime.toFixed(3)), bubbles: true, composed: true }));
              }
              this._syncing = false;
            }}
          ></video>
        ` : html`
          <div class="stage-placeholder">导入视频开始预览</div>
        `}
      </div>
    `;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
  }
}
