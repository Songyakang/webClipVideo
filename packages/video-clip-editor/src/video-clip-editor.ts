import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { MediaAsset, TimelineClip, TimelineTrack, ProjectState } from './lib/types.js';
import { loadProject, saveProject, listAssets, saveAsset, deleteAssetFromDB, saveFile, getFile } from './lib/store.js';
import { computeDuration } from './lib/media.js';
import './components/asset-library.js';
import './components/preview-canvas.js';
import './components/inspector-panel.js';
import './components/timeline-panel.js';
import './components/transport-bar.js';

const defaultTracks = (): TimelineTrack[] => [
  { id: 'V1', label: 'V1', type: 'video', muted: false, disabled: false },
  { id: 'V2', label: 'V2', type: 'video', muted: false, disabled: false },
  { id: 'A1', label: 'A1', type: 'audio', muted: false, disabled: false },
  { id: 'A2', label: 'A2', type: 'audio', muted: false, disabled: false },
  { id: 'T1', label: 'T1', type: 'text', muted: false, disabled: false },
];

const DEFAULT_PROJECT: ProjectState = {
  version: 1,
  name: '默认项目',
  playheadSeconds: 0,
  tracks: defaultTracks(),
  timelineClips: [],
  updatedAt: new Date().toISOString(),
};

@customElement('video-clip-editor')
export class VideoClipEditor extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: #0a0e14;
      color: #c8d6e5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    .workspace-shell {
      display: grid;
      grid-template-columns: 260px 1fr 280px;
      grid-template-rows: 1fr auto;
      flex: 1;
      min-height: 0;
      gap: 1px;
      background: rgba(148, 171, 214, 0.06);
    }

    .timeline-panel-wrapper {
      grid-column: 1 / -1;
      min-height: 0;
    }
  `;

  @state() _assets: MediaAsset[] = [];
  @state() _project: ProjectState = DEFAULT_PROJECT;
  @state() _message = '素材库空着, 先传点东西进来';
  @state() _isPlaying = false;
  @state() _busyAssetId: string | null = null;

  private _fileMap = new Map<string, File>();
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
      this._project = { ...savedProject, tracks: savedProject.tracks.length > 0 ? savedProject.tracks : defaultTracks() };
      this._playheadSeconds = savedProject.playheadSeconds;
    }
    this._assets = savedAssets;
    this.requestUpdate();
  }

  private async _saveProject() {
    const project: ProjectState = {
      ...this._project,
      playheadSeconds: this._playheadSeconds,
      updatedAt: new Date().toISOString(),
    };
    await saveProject(project);
  }

  // --- Event handlers ---

  private _onUpload = async (e: CustomEvent) => {
    const files = e.detail as File[];
    if (!files.length) return;

    this._message = `正在分析并导入 ${files.length} 个素材...`;
    this.requestUpdate();

    for (const file of files) {
      let durationSeconds: number | undefined;
      if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        durationSeconds = await computeDuration(file).catch(() => undefined);
      }

      const id = crypto.randomUUID();
      const asset: MediaAsset = {
        id,
        title: file.name.replace(/\.[^.]+$/, '') || file.name,
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        kind: file.type.startsWith('image/') ? 'image'
          : file.type.startsWith('video/') ? 'video'
          : file.type.startsWith('audio/') ? 'audio'
          : 'other',
        size: file.size,
        durationSeconds,
        status: 'ready',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        files: { original: id },
      };

      await saveFile(id, file);
      await saveAsset(asset);
      this._fileMap.set(id, file);
      this._assets = [...this._assets, asset];
    }

    this._message = `导入了 ${files.length} 个素材`;
    await this._saveProject();
    this.requestUpdate();
  };

  private _onDeleteAsset = async (e: CustomEvent) => {
    const id = e.detail as string;
    await deleteAssetFromDB(id);
    this._assets = this._assets.filter((a) => a.id !== id);
    this._project = {
      ...this._project,
      timelineClips: this._project.timelineClips.filter((c) => c.assetId !== id),
    };
    await this._saveProject();
    this.requestUpdate();
  };

  private _onUpdateClips = (e: CustomEvent) => {
    this._project = {
      ...this._project,
      timelineClips: e.detail as TimelineClip[],
      updatedAt: new Date().toISOString(),
    };
    this.requestUpdate();
  };

  private _onUpdateTracks = (e: CustomEvent) => {
    this._project = {
      ...this._project,
      tracks: e.detail as TimelineTrack[],
      updatedAt: new Date().toISOString(),
    };
    this.requestUpdate();
  };

  private _onUpdateProject = (e: CustomEvent) => {
    const patch = e.detail as Partial<ProjectState>;
    this._project = { ...this._project, ...patch, updatedAt: new Date().toISOString() };
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

  private _onSave = () => {
    void this._saveProject().then(() => {
      this._message = '项目已保存';
      this.requestUpdate();
    });
  };

  render() {
    return html`
      <div class="workspace-shell">
        <asset-library
          .assets=${this._assets}
          @upload=${this._onUpload}
          @delete-asset=${this._onDeleteAsset}
          @message=${this._onMessage}
        ></asset-library>

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
          @save-project=${this._onSave}
        ></preview-canvas>

        <inspector-panel
          .project=${this._project}
          .playheadSeconds=${this._playheadSeconds}
          .assets=${this._assets}
          .busyAssetId=${this._busyAssetId}
          .message=${this._message}
          @update-clips=${this._onUpdateClips}
          @update-tracks=${this._onUpdateTracks}
          @update-project=${this._onUpdateProject}
          @message=${this._onMessage}
          @busy-change=${this._onBusyChange}
          @save-project=${this._onSave}
        ></inspector-panel>

        <div class="timeline-panel-wrapper">
          <timeline-panel
            .project=${this._project}
            .playheadSeconds=${this._playheadSeconds}
            .assets=${this._assets}
            .isPlaying=${this._isPlaying}
            @update-clips=${this._onUpdateClips}
            @update-tracks=${this._onUpdateTracks}
            @playhead-change=${this._onPlayheadChange}
            @playing-change=${this._onPlayingChange}
            @message=${this._onMessage}
          ></timeline-panel>
        </div>
      </div>
    `;
  }
}
