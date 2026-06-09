import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { MediaAsset, TimelineClip, ProjectState } from './lib/types.js';
import { loadProject, saveProject, listAssets, saveAsset, deleteAssetFromDB, saveFile } from './lib/store.js';
import { computeDuration } from './lib/media.js';
import './components/preview-canvas.js';
import './components/timeline-panel.js';

const SINGLE_TRACK = { id: 'V1', label: '视频轨', type: 'video' as const, muted: false, disabled: false };

const DEFAULT_PROJECT: ProjectState = {
  version: 1,
  name: '默认项目',
  playheadSeconds: 0,
  tracks: [SINGLE_TRACK],
  timelineClips: [],
  updatedAt: new Date().toISOString(),
};

@customElement('video-clip-editor')
export class VideoClipEditor extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100vh;
      background: #0a0e14;
      color: #c8d6e5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      overflow: hidden;
      box-sizing: border-box;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid rgba(148,171,214,0.06);
      gap: 12px;
    }

    .topbar .brand {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
    }

    .topbar .actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .topbar button {
      padding: 7px 14px;
      border-radius: 8px;
      border: 1px solid rgba(148,171,214,0.15);
      background: rgba(255,255,255,0.04);
      color: #c8d6e5;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .topbar button:hover { background: rgba(255,255,255,0.08); }
    .topbar button.primary { background: rgba(77,150,255,0.15); border-color: rgba(77,150,255,0.25); color: #4d96ff; }
    .topbar button.primary:hover { background: rgba(77,150,255,0.25); }
    #file-picker { display: none; }

    .message {
      font-size: 12px;
      color: #6b7d99;
      flex: 1;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .main-area {
      height: calc(100vh - 80px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .preview-section {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .timeline-section {
      flex-shrink: 0;
    }
  `;

  @state() _assets: MediaAsset[] = [];
  @state() _project: ProjectState = DEFAULT_PROJECT;
  @state() _message = '导入视频开始剪辑';
  @state() _isPlaying = false;
  @state() _busyAssetId: string | null = null;

  private _playheadSeconds = 0;

  connectedCallback() {
    super.connectedCallback();
    void this._init();
  }

  private async _init() {
    const [savedProject, savedAssets] = await Promise.all([
      loadProject(),
      listAssets(),
    ]);
    if (savedProject) {
      this._project = { ...savedProject, tracks: [SINGLE_TRACK] };
      this._playheadSeconds = savedProject.playheadSeconds;
    }
    this._assets = savedAssets;
    this.requestUpdate();
  }

  private async _saveProject() {
    await saveProject({
      ...this._project,
      playheadSeconds: this._playheadSeconds,
      updatedAt: new Date().toISOString(),
    });
  }

  private _openFilePicker() {
    const input = this.renderRoot.querySelector('#file-picker') as HTMLInputElement | null;
    input?.click();
  }

  private async _handleUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    console.log('Selected files:', input.files);
    if (!files?.length) return;

    this._message = '分析中...';
    this.requestUpdate();

    for (const file of Array.from(files)) {
      let durationSeconds: number | undefined;
      console.log('[upload] processing file:', file.name, 'type:', file.type, 'size:', file.size);
      if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        durationSeconds = await computeDuration(file).catch((e) => {
          console.error('[upload] computeDuration failed:', e);
          return undefined;
        });
        console.log('[upload] duration:', durationSeconds);
      }

      const id = crypto.randomUUID();
      const asset: MediaAsset = {
        id,
        title: file.name.replace(/\.[^.]+$/, '') || file.name,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        kind: file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'other',
        size: file.size,
        durationSeconds,
        status: 'ready',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        files: { original: id },
      };

      await saveFile(id, file);
      await saveAsset(asset);
      this._assets = [...this._assets, asset];
      console.log('[upload] asset saved, kind:', asset.kind, 'total assets:', this._assets.length);

      // Auto-add video to the single track (replace existing)
      if (asset.kind === 'video' && durationSeconds) {
        const clip: TimelineClip = {
          id: crypto.randomUUID(),
          assetId: asset.id,
          trackId: 'V1',
          offsetSeconds: 0,
          trimStart: 0,
          trimEnd: durationSeconds,
          baseDuration: durationSeconds,
        };
        this._project = {
          ...this._project,
          timelineClips: [clip],
        };
        this._playheadSeconds = clip.offsetSeconds;
        console.log('[upload] clip replaced, new clip:', clip.id);
      } else {
        console.log('[upload] clip NOT added. kind=', asset.kind, 'durationSeconds=', durationSeconds);
      }
    }

    this._message = `已导入 ${files.length} 个文件`;
    await this._saveProject();
    this.requestUpdate();
    console.log('[upload] done, assets:', this._assets.length, 'clips:', this._project.timelineClips.length);
  }

  private _onUpdateClips = (e: CustomEvent) => {
    this._project = {
      ...this._project,
      timelineClips: e.detail as TimelineClip[],
      updatedAt: new Date().toISOString(),
    };
    this.requestUpdate();
  };

  private _onPlayheadChange = (e: CustomEvent) => {
    this._playheadSeconds = e.detail as number;
  };

  private _onPlayingChange = (e: CustomEvent) => {
    this._isPlaying = e.detail as boolean;
    this.requestUpdate();
  };

  private _onMessage = (e: CustomEvent) => {
    this._message = e.detail as string;
    this.requestUpdate();
  };

  private _onBusyChange = (e: CustomEvent) => {
    this._busyAssetId = e.detail as string | null;
    this.requestUpdate();
  };

  render() {
    const projectDuration = Math.max(20, Math.ceil(
      this._project.timelineClips.reduce((max, c) =>
        Math.max(max, c.offsetSeconds + Math.max(1, c.trimEnd - c.trimStart)), 20)
    ));

    return html`
      <div class="topbar">
        <span class="brand">webVideoClip</span>
        <span class="message">${this._message}</span>
        <div class="actions">
          <input id="file-picker" type="file" multiple accept="video/*,audio/*" @change=${this._handleUpload} />
          <button class="primary" @click=${this._openFilePicker}>导入视频</button>
        </div>
      </div>

      <div class="main-area">
        <div class="preview-section">
          <preview-canvas
            .project=${this._project}
            .playheadSeconds=${this._playheadSeconds}
            .isPlaying=${this._isPlaying}
            .assets=${this._assets}
            .busyAssetId=${this._busyAssetId}
            @playhead-change=${this._onPlayheadChange}
            @playing-change=${this._onPlayingChange}
            @message=${this._onMessage}
            @busy-change=${this._onBusyChange}
            @update-clips=${this._onUpdateClips}
          ></preview-canvas>
        </div>

        <div class="timeline-section">
          <timeline-panel
            .project=${this._project}
            .playheadSeconds=${this._playheadSeconds}
            .assets=${this._assets}
            .isPlaying=${this._isPlaying}
            @update-clips=${this._onUpdateClips}
            @playhead-change=${this._onPlayheadChange}
            @message=${this._onMessage}
          ></timeline-panel>
        </div>
      </div>
    `;
  }
}
