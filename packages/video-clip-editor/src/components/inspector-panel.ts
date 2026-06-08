import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { MediaAsset, ProjectState } from '../lib/types.js';
import { transcodeToMp4 } from '../lib/media.js';
import { getFile } from '../lib/store.js';

const formatSeconds = (s: number) => {
  const m = Math.floor(Math.max(0, s) / 60).toString().padStart(2, '0');
  const sec = (Math.max(0, s) % 60).toFixed(0).padStart(2, '0');
  return `${m}:${sec}`;
};

@customElement('inspector-panel')
export class InspectorPanel extends LitElement {
  static styles = css`
    :host {
      display: flex; flex-direction: column; background: rgba(255,255,255,0.02);
      border-left: 1px solid rgba(148,171,214,0.08); overflow: hidden;
    }
    .panel-header { padding: 16px; border-bottom: 1px solid rgba(148,171,214,0.06); }
    .panel-header h2 { font-size: 14px; margin: 4px 0 0; }
    .panel-label { font-size: 11px; color: #6b7d99; }
    .tabs { display: flex; border-bottom: 1px solid rgba(148,171,214,0.06); }
    .tab {
      flex: 1; padding: 10px; background: none; border: none; color: #6b7d99;
      font-size: 12px; cursor: pointer; border-bottom: 2px solid transparent;
      transition: all 0.15s;
    }
    .tab.active { color: #c8d6e5; border-bottom-color: #4d96ff; }
    .content { flex: 1; overflow-y: auto; padding: 16px; }
    .section { margin-bottom: 16px; }
    .section span { display: block; font-size: 11px; color: #6b7d99; margin-bottom: 4px; }
    .section strong { font-size: 14px; }
    button {
      padding: 8px 14px; border-radius: 8px; border: 1px solid rgba(148,171,214,0.12);
      background: rgba(255,255,255,0.04); color: #c8d6e5; cursor: pointer;
      font-size: 12px; margin-right: 6px; margin-bottom: 6px; transition: background 0.15s;
    }
    button:hover { background: rgba(255,255,255,0.08); }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    button.primary { background: rgba(77,150,255,0.15); border-color: rgba(77,150,255,0.25); color: #4d96ff; }
    button.primary:hover { background: rgba(77,150,255,0.25); }
    button.danger { color: #e0556a; border-color: rgba(224,85,106,0.2); }
    button.danger:hover { background: rgba(224,85,106,0.1); }
    .empty { color: #6b7d99; font-size: 13px; padding: 20px 0; }
    input[type="range"] { width: 100%; margin: 8px 0; }
    .text-input { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(148,171,214,0.12);
      border-radius: 8px; padding: 8px; color: #c8d6e5; font-size: 13px; resize: vertical; }
    .color-input { width: 40px; height: 28px; border: none; border-radius: 6px; cursor: pointer; }
  `;

  @property({ type: Object }) project!: ProjectState;
  @property({ type: Number }) playheadSeconds = 0;
  @property({ type: Array }) assets: MediaAsset[] = [];
  @property({ type: String }) busyAssetId: string | null = null;
  @property({ type: String }) message = '';

  @property({ type: String }) _tab: 'project' | 'clip' | 'editor' | 'export' = 'project';

  private get _assetMap() {
    return new Map(this.assets.map((a) => [a.id, a]));
  }

  private get _trackMap() {
    return new Map(this.project.tracks.map((t) => [t.id, t]));
  }

  private get _selectedClip() {
    return null; // In MVP, use last active clip
  }

  private async _runExport() {
    const clips = this.project.timelineClips;
    if (clips.length === 0) {
      this.dispatchEvent(new CustomEvent('message', { detail: '没有可导出的片段', bubbles: true, composed: true }));
      return;
    }

    this.dispatchEvent(new CustomEvent('busy-change', { detail: 'export', bubbles: true, composed: true }));

    try {
      for (const clip of clips) {
        const asset = this._assetMap.get(clip.assetId ?? '');
        if (!asset || asset.kind !== 'video') continue;

        const file = await getFile(asset.id);
        if (!file) continue;

        const result = await transcodeToMp4(file);
        const blob = new Blob([result as BlobPart], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${asset.title}-export.mp4`;
        a.click();
        URL.revokeObjectURL(url);

        this.dispatchEvent(new CustomEvent('message', { detail: '导出完成', bubbles: true, composed: true }));
        break;
      }
    } catch (err) {
      this.dispatchEvent(new CustomEvent('message', {
        detail: err instanceof Error ? err.message : '导出失败',
        bubbles: true,
        composed: true,
      }));
    } finally {
      this.dispatchEvent(new CustomEvent('busy-change', { detail: null, bubbles: true, composed: true }));
    }
  }

  render() {
    const projectDuration = Math.max(20, ...this.project.timelineClips.map(
      (c) => c.offsetSeconds + Math.max(1, c.trimEnd - c.trimStart)
    ), 20);

    return html`
      <div class="panel-header">
        <p class="panel-label">检查器</p>
        <h2>属性 & 导出</h2>
      </div>

      <div class="tabs">
        ${(['project', 'clip', 'editor', 'export'] as const).map((t) => html`
          <button class="tab ${this._tab === t ? 'active' : ''}" @click=${() => { this._tab = t; }}>
            ${t === 'project' ? '项目' : t === 'clip' ? '片段' : t === 'editor' ? '编辑' : '导出'}
          </button>
        `)}
      </div>

      <div class="content">
        ${this._tab === 'project' ? html`
          <div class="section">
            <span>项目名</span>
            <strong>${this.project.name}</strong>
          </div>
          <div class="section">
            <span>轨道数量</span>
            <strong>${this.project.tracks.length}</strong>
          </div>
          <div class="section">
            <span>播放头</span>
            <strong>${formatSeconds(this.playheadSeconds)}</strong>
          </div>
          <div class="section">
            <span>素材总数</span>
            <strong>${this.assets.length}</strong>
          </div>
          <div class="section">
            <span>片段数</span>
            <strong>${this.project.timelineClips.length} 段</strong>
          </div>
          <div class="section">
            <span>项目总时长</span>
            <strong>${formatSeconds(projectDuration)}</strong>
          </div>
          <button class="primary" @click=${() => {
            this.dispatchEvent(new CustomEvent('save-project', { bubbles: true, composed: true }));
          }}>保存项目</button>
        ` : this._tab === 'export' ? html`
          <div class="section">
            <span>导出视频</span>
            <span style="color:#6b7d99;font-size:12px">浏览器直接处理并下载 MP4</span>
          </div>
          <button class="primary"
            ?disabled=${this.busyAssetId === 'export'}
            @click=${() => void this._runExport()}
          >${this.busyAssetId === 'export' ? '导出中...' : '开始导出'}</button>
          ${this.project.timelineClips.length === 0 ? html`
            <div class="empty">先往时间线里加几个片段</div>
          ` : null}
        ` : html`
          <div class="empty">点击时间线上的片段查看详情</div>
        `}
      </div>
    `;
  }
}
