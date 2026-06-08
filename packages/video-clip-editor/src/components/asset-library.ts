import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { MediaAsset } from '../lib/types.js';

const kindLabel: Record<string, string> = {
  image: '图片', video: '视频', audio: '音频', other: '文件',
};

const formatSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

@customElement('asset-library')
export class AssetLibrary extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      background: rgba(255,255,255,0.02);
      border-right: 1px solid rgba(148,171,214,0.08);
      overflow: hidden;
    }
    .panel-header {
      padding: 16px;
      border-bottom: 1px solid rgba(148,171,214,0.06);
    }
    .panel-header h2 { font-size: 14px; font-weight: 600; margin: 4px 0 0; }
    .panel-label { font-size: 11px; color: #6b7d99; text-transform: uppercase; }
    .search-row {
      display: flex; gap: 8px; padding: 12px 16px;
      border-bottom: 1px solid rgba(148,171,214,0.06);
    }
    .search-input {
      flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(148,171,214,0.12);
      border-radius: 8px; padding: 8px 12px; color: #c8d6e5; font-size: 13px; outline: none;
    }
    .search-input:focus { border-color: rgba(77, 150, 255, 0.4); }
    .asset-list {
      flex: 1; overflow-y: auto; padding: 8px;
    }
    .asset-item {
      display: flex; align-items: center; gap: 10px; padding: 10px;
      border-radius: 10px; cursor: pointer; border: 1px solid transparent;
      transition: background 0.15s; margin-bottom: 4px;
      background: none; color: inherit; font: inherit; width: 100%; text-align: left;
    }
    .asset-item:hover { background: rgba(255,255,255,0.04); }
    .asset-item.active { background: rgba(77,150,255,0.1); border-color: rgba(77,150,255,0.25); }
    .asset-thumb {
      width: 44px; height: 44px; border-radius: 8px; overflow: hidden;
      flex-shrink: 0; background: rgba(255,255,255,0.05);
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; color: #6b7d99;
    }
    .asset-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .asset-meta { flex: 1; min-width: 0; }
    .asset-meta strong { display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .asset-meta span { font-size: 11px; color: #6b7d99; }
    .upload-btn {
      margin: 12px 16px; padding: 10px; border-radius: 10px;
      background: rgba(77,150,255,0.15); color: #4d96ff;
      border: 1px solid rgba(77,150,255,0.2); cursor: pointer;
      font-size: 13px; text-align: center; transition: background 0.15s;
    }
    .upload-btn:hover { background: rgba(77,150,255,0.25); }
    .upload-btn input { display: none; }
    .empty-card {
      padding: 32px 16px; text-align: center; color: #6b7d99; font-size: 13px;
    }
    .delete-btn {
      background: none; border: none; color: #e0556a; cursor: pointer;
      font-size: 11px; padding: 4px 8px; border-radius: 6px; opacity: 0;
      transition: opacity 0.15s;
    }
    .asset-item:hover .delete-btn { opacity: 1; }
    .delete-btn:hover { background: rgba(224,85,106,0.15); }
    .drop-hint { font-size: 11px; color: #6b7d99; padding: 0 16px 8px; }
  `;

  @property({ type: Array }) assets: MediaAsset[] = [];
  @property({ type: String }) filterKind = 'all';
  @property({ type: String }) searchText = '';
  @property({ type: String }) selectedAssetId: string | null = null;

  private _handleUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;
    this.dispatchEvent(new CustomEvent('upload', {
      detail: Array.from(files),
      bubbles: true,
      composed: true,
    }));
    input.value = '';
  }

  private _handleDelete(asset: MediaAsset, e: Event) {
    e.stopPropagation();
    if (!confirm(`删除素材 ${asset.title}?`)) return;
    this.dispatchEvent(new CustomEvent('delete-asset', {
      detail: asset.id,
      bubbles: true,
      composed: true,
    }));
    if (this.selectedAssetId === asset.id) {
      this.selectedAssetId = null;
    }
  }

  render() {
    const filtered = this.assets.filter((a) => {
      if (this.filterKind !== 'all' && a.kind !== this.filterKind) return false;
      if (this.searchText && !a.title.toLowerCase().includes(this.searchText.toLowerCase())) return false;
      return true;
    });

    const stats = {
      total: this.assets.length,
      video: this.assets.filter((a) => a.kind === 'video').length,
      totalSize: this.assets.reduce((s, a) => s + a.size, 0),
    };

    return html`
      <div class="panel-header">
        <p class="panel-label">素材库</p>
        <h2>项目媒体 · ${stats.total} 个</h2>
      </div>

      <div class="search-row">
        <input
          class="search-input"
          placeholder="搜素材..."
          .value=${this.searchText}
          @input=${(e: InputEvent) => { this.searchText = (e.target as HTMLInputElement).value; }}
        />
      </div>

      <label class="upload-btn">
        <input type="file" multiple @change=${this._handleUpload} />
        导入素材
      </label>

      <div class="drop-hint">拖素材到时间线即可入轨</div>

      <div class="asset-list">
        ${filtered.length === 0 ? html`
          <div class="empty-card">还没有素材，先导入视频或图片</div>
        ` : filtered.map((asset) => html`
          <button
            class="asset-item ${this.selectedAssetId === asset.id ? 'active' : ''}"
            @click=${() => { this.selectedAssetId = asset.id; }}
            draggable="true"
            @dragstart=${(e: DragEvent) => {
              e.dataTransfer!.setData('text/asset-id', asset.id);
              e.dataTransfer!.effectAllowed = 'copy';
            }}
          >
            <div class="asset-thumb">
              ${asset.kind === 'image' ? html`<span>IMG</span>` :
                asset.kind === 'video' ? html`<span>VID</span>` :
                asset.kind === 'audio' ? html`<span>AUD</span>` :
                html`<span>FILE</span>`}
            </div>
            <div class="asset-meta">
              <strong>${asset.title}</strong>
              <span>${kindLabel[asset.kind] ?? '文件'} · ${formatSize(asset.size)}</span>
            </div>
            <button class="delete-btn" @click=${(e: Event) => this._handleDelete(asset, e)}>删除</button>
          </button>
        `)}
      </div>
    `;
  }
}
