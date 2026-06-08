import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { createRef, ref } from 'lit/directives/ref.js';
import type { MediaAsset, ProjectState, TimelineClip } from '../lib/types.js';
import { getFile, saveFile } from '../lib/store.js';
import { generateThumbnail, transcodeToMp4 } from '../lib/media.js';

type VisualLayer = {
  clip: TimelineClip;
  asset?: MediaAsset;
  track: { id: string; label: string; type: string; muted?: boolean; disabled?: boolean };
  trackPriority: number;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const clipDuration = (clip: TimelineClip) => Math.max(1, clip.trimEnd - clip.trimStart);

@customElement('preview-canvas')
export class PreviewCanvas extends LitElement {
  static styles = css`
    :host {
      display: flex; flex-direction: column; background: rgba(255,255,255,0.02); overflow: hidden;
    }
    .panel-header { padding: 16px; border-bottom: 1px solid rgba(148,171,214,0.06); }
    .panel-header h2 { font-size: 14px; margin: 4px 0 0; }
    .panel-label { font-size: 11px; color: #6b7d99; }
    .stage { flex: 1; min-height: 0; display: grid; place-items: center; overflow: hidden; background: #06090f; }
    .stage canvas { width: 100%; height: 100%; display: block; cursor: pointer; }
    .stage-placeholder { color: #6b7d99; font-size: 14px; }
  `;

  @property({ type: Object }) project!: ProjectState;
  @property({ type: Number }) playheadSeconds = 0;
  @property({ type: Boolean }) isPlaying = false;
  @property({ type: Array }) assets: MediaAsset[] = [];
  @property({ type: String }) busyAssetId: string | null = null;

  private _canvasRef = createRef<HTMLCanvasElement>();
  private _hiddenVideoRef = createRef<HTMLVideoElement>();
  private _videoMap = new Map<string, HTMLVideoElement>();
  private _imageMap = new Map<string, HTMLImageElement>();
  private _rafId: number | null = null;
  private _startTime: number | null = null;
  private _startPlayhead = 0;
  private _playerAssetId: string | null = null;
  private _playerReady = false;

  private _assetMap = new Map<string, MediaAsset>();
  private _trackMap = new Map<string, { id: string; label: string; type: string; muted?: boolean; disabled?: boolean }>();
  private _trackPriority = new Map<string, number>();

  updated() {
    this._assetMap = new Map(this.assets.map((a) => [a.id, a]));
    this._trackMap = new Map(this.project.tracks.map((t) => [t.id, t]));
    this._trackPriority = new Map(this.project.tracks.map((t, i) => [t.id, i]));
  }

  private _buildLayers(playhead: number): VisualLayer[] {
    const layers: VisualLayer[] = [];
    for (const clip of this.project.timelineClips) {
      const clipEnd = clip.offsetSeconds + clipDuration(clip);
      if (playhead < clip.offsetSeconds || playhead > clipEnd) continue;
      const track = this._trackMap.get(clip.trackId);
      if (!track || track.disabled) continue;
      const asset = this._assetMap.get(clip.assetId ?? '');
      layers.push({ clip, asset, track, trackPriority: this._trackPriority.get(track.id) ?? 0 });
    }
    layers.sort((a, b) => a.trackPriority - b.trackPriority);
    return layers;
  }

  private async _ensureFile(asset: MediaAsset): Promise<File> {
    let file = await getFile(asset.id);
    if (!file) {
      throw new Error('文件不存在');
    }
    return file;
  }

  private _renderFrame(playhead: number) {
    const canvas = this._canvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = canvas.parentElement;
    if (container) {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    ctx.fillStyle = '#06090f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const layers = this._buildLayers(playhead);
    for (const layer of layers) {
      const { clip, asset, track } = layer;
      if (track.type === 'text') {
        ctx.save();
        ctx.font = `${clip.fontSize ?? 48}px sans-serif`;
        ctx.fillStyle = clip.fontColor ?? '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(clip.text ?? '文字', canvas.width / 2, canvas.height / 2);
        ctx.restore();
        continue;
      }
      if (!asset || (asset.kind !== 'video' && asset.kind !== 'image')) continue;

      const sourceTime = clip.trimStart + (playhead - clip.offsetSeconds);
      const clampedTime = clamp(sourceTime, 0, clip.trimEnd);

      if (asset.kind === 'video') {
        const video = this._videoMap.get(asset.id);
        if (video && video.readyState >= 1) {
          video.currentTime = clampedTime;
          ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
        }
      } else if (asset.kind === 'image') {
        const img = this._imageMap.get(asset.id);
        if (img?.complete) {
          ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        }
      }
    }
  }

  private _startPlayback() {
    this._startPlayhead = this.playheadSeconds;
    this._startTime = null;
    const step = (timestamp: number) => {
      if (this._startTime === null) this._startTime = timestamp;
      const elapsed = (timestamp - this._startTime) / 1000;
      const next = this._startPlayhead + elapsed;
      const projectDuration = Math.max(20, ...this.project.timelineClips.map(
        (c) => c.offsetSeconds + clipDuration(c)
      ), 20);
      if (next >= projectDuration) {
        this.dispatchEvent(new CustomEvent('playing-change', { detail: false, bubbles: true, composed: true }));
        return;
      }
      this._renderFrame(next);
      this.dispatchEvent(new CustomEvent('playhead-change', { detail: next, bubbles: true, composed: true }));
      this._rafId = requestAnimationFrame(step);
    };
    this._rafId = requestAnimationFrame(step);
  }

  private _stopPlayback() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._renderFrame(this.playheadSeconds);
  }

  private async _runJob(job: 'thumbnail' | 'transcode') {
    const layers = this._buildLayers(this.playheadSeconds);
    const videoLayer = layers.find((l) => l.asset?.kind === 'video');
    if (!videoLayer?.asset) {
      this.dispatchEvent(new CustomEvent('message', { detail: '当前没有视频素材', bubbles: true, composed: true }));
      return;
    }

    const asset = videoLayer.asset;
    this.dispatchEvent(new CustomEvent('busy-change', { detail: asset.id, bubbles: true, composed: true }));

    try {
      const file = await this._ensureFile(asset);
      if (job === 'thumbnail') {
        const blob = await generateThumbnail(file, 1);
        const thumbnailFile = new File([blob], `${asset.id}-thumb.jpg`, { type: 'image/jpeg' });
        await saveFile(`${asset.id}-thumb`, thumbnailFile);
        const url = URL.createObjectURL(blob);
        const assetIndex = this.assets.findIndex((a) => a.id === asset.id);
        if (assetIndex >= 0) {
          const updated = { ...this.assets[assetIndex], files: { ...this.assets[assetIndex].files, thumbnail: url } };
          this.dispatchEvent(new CustomEvent('message', { detail: '缩略图搞定了', bubbles: true, composed: true }));
        }
        this.dispatchEvent(new CustomEvent('message', { detail: '缩略图搞定了', bubbles: true, composed: true }));
      } else {
        const result = await transcodeToMp4(file);
        const blob = new Blob([result as BlobPart], { type: 'video/mp4' });
        await saveFile(`${asset.id}-transcoded`, new File([blob], `${asset.id}.mp4`, { type: 'video/mp4' }));
        this.dispatchEvent(new CustomEvent('message', { detail: '转码搞定了', bubbles: true, composed: true }));
      }
    } catch (err) {
      this.dispatchEvent(new CustomEvent('message', {
        detail: err instanceof Error ? err.message : '处理失败',
        bubbles: true,
        composed: true,
      }));
    } finally {
      this.dispatchEvent(new CustomEvent('busy-change', { detail: null, bubbles: true, composed: true }));
    }
  }

  render() {
    const layers = this._buildLayers(this.playheadSeconds);
    const hasContent = layers.length > 0;

    return html`
      <div class="panel-header">
        <p class="panel-label">预览监视器</p>
        <h2>${hasContent ? '播放中' : '等待素材'}</h2>
      </div>
      <div class="stage">
        ${hasContent ? html`
          <canvas ${ref(this._canvasRef)} @click=${(e: MouseEvent) => {
            const canvas = this._canvasRef.value;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            const projectDuration = Math.max(20, ...this.project.timelineClips.map(
              (c) => c.offsetSeconds + clipDuration(c)
            ), 20);
            const t = clamp(ratio * projectDuration, 0, projectDuration);
            this.dispatchEvent(new CustomEvent('playhead-change', { detail: Number(t.toFixed(2)), bubbles: true, composed: true }));
          }}></canvas>
        ` : html`<div class="stage-placeholder">导入素材后预览</div>`}
      </div>
      <div style="position:fixed;top:-9999px;left:-9999px;width:320px;height:180px;opacity:0;pointer-events:none" aria-hidden="true">
        ${this.assets.filter((a) => a.kind === 'video').map((a) => html`
          <video
            src=${a.files.original}
            @loadedmetadata=${(e: Event) => {
              const el = e.target as HTMLVideoElement;
              this._videoMap.set(a.id, el);
            }}
            muted preload="auto"
          ></video>
        `)}
        ${this.assets.filter((a) => a.kind === 'image').map((a) => html`
          <img
            src=${a.files.original}
            @load=${(e: Event) => {
              const el = e.target as HTMLImageElement;
              this._imageMap.set(a.id, el);
            }}
          />
        `)}
      </div>
      <transport-bar
        .isPlaying=${this.isPlaying}
        .playheadSeconds=${this.playheadSeconds}
        .message=${this.dispatchEvent.length > 0 ? '' : ''}
        .hasPreviewAsset=${hasContent}
        .busyAssetId=${this.busyAssetId}
        @toggle-play=${() => {
          if (this.isPlaying) {
            this._stopPlayback();
            this.dispatchEvent(new CustomEvent('playing-change', { detail: false, bubbles: true, composed: true }));
          } else {
            this.dispatchEvent(new CustomEvent('playing-change', { detail: true, bubbles: true, composed: true }));
            this._startPlayback();
          }
        }}
        @step-playhead=${(e: CustomEvent) => {
          const delta = e.detail as number;
          const projectDuration = Math.max(20, ...this.project.timelineClips.map(
            (c) => c.offsetSeconds + clipDuration(c)
          ), 20);
          const next = clamp(this.playheadSeconds + delta, 0, projectDuration);
          this.dispatchEvent(new CustomEvent('playhead-change', { detail: next, bubbles: true, composed: true }));
        }}
        @split-clip=${() => {
          this.dispatchEvent(new CustomEvent('split-at-playhead', { bubbles: true, composed: true }));
        }}
        @run-job=${(e: CustomEvent) => {
          void this._runJob(e.detail);
        }}
      ></transport-bar>
    `;
  }
}
