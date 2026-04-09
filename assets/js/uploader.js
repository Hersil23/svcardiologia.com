/**
 * SVC App — File Uploader
 * Drag-and-drop uploader with image compression + Bunny.net CDN
 */
class SVCUploader {
  constructor(config) {
    this.containerId = config.containerId;
    this.type        = config.type;
    this.contextId   = config.contextId;
    this.accept      = config.accept || 'image/*,application/pdf';
    this.maxSizeMB   = config.maxSizeMB || 2;
    this.label       = config.label || 'Seleccionar archivo';
    this.onSuccess   = config.onSuccess || null;
    this.extraFields = config.extraFields || {};
    this.fileData    = null;
    this.container   = null;
  }

  _svgIcon(paths, color = 'currentColor') {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '32');
    svg.setAttribute('height', '32');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', color);
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    paths.forEach(d => {
      const el = document.createElementNS(ns, d.tag || 'path');
      Object.entries(d).forEach(([k, v]) => { if (k !== 'tag') el.setAttribute(k, v); });
      svg.appendChild(el);
    });
    return svg;
  }

  _uploadIcon() {
    return this._svgIcon([
      { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4' },
      { tag: 'polyline', points: '17 8 12 3 7 8' },
      { tag: 'line', x1: '12', y1: '3', x2: '12', y2: '15' }
    ]);
  }

  _fileIcon(color = '#22C55E') {
    return this._svgIcon([
      { d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z' },
      { tag: 'polyline', points: '14 2 14 8 20 8' }
    ], color);
  }

  render() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) return;

    this.container.replaceChildren();
    const zone = document.createElement('div');
    zone.className = 'upload-zone';

    const icon = document.createElement('div');
    icon.className = 'upload-zone-icon';
    icon.appendChild(this._uploadIcon());

    const label = document.createElement('div');
    label.className = 'upload-zone-label';
    label.textContent = this.label;

    const hint = document.createElement('div');
    hint.className = 'upload-zone-hint';
    hint.textContent = `Máx. ${this.maxSizeMB}MB`;

    const btn = document.createElement('button');
    btn.className = 'upload-zone-btn';
    btn.textContent = 'Seleccionar archivo';
    btn.type = 'button';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = this.accept;
    input.style.display = 'none';

    const progress = document.createElement('div');
    progress.className = 'upload-progress';
    progress.style.display = 'none';
    const bar = document.createElement('div');
    bar.className = 'upload-progress-bar';
    bar.style.width = '0%';
    progress.appendChild(bar);

    zone.append(icon, label, hint, btn, progress);
    this.container.appendChild(zone);
    this.container.appendChild(input);

    btn.addEventListener('click', () => input.click());
    zone.addEventListener('click', (e) => {
      if (e.target === zone || e.target === icon || e.target === label) input.click();
    });

    input.addEventListener('change', () => {
      if (input.files[0]) this.upload(input.files[0]);
    });

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files[0]) this.upload(e.dataTransfer.files[0]);
    });
  }

  async compressImage(file) {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) return file;
    if (file.size < 200 * 1024) return file;

    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_W = 1200;
        let w = img.width, h = img.height;
        if (w > MAX_W) {
          h = Math.round(h * (MAX_W / w));
          w = MAX_W;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          resolve(blob ? new File([blob], file.name, { type: file.type }) : file);
        }, file.type, 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  async upload(file) {
    const zone = this.container.querySelector('.upload-zone');
    const progress = this.container.querySelector('.upload-progress');
    const bar = this.container.querySelector('.upload-progress-bar');

    if (file.size > this.maxSizeMB * 1024 * 1024) {
      SVC.toast.error(`Archivo muy grande. Máximo: ${this.maxSizeMB}MB`);
      return;
    }

    progress.style.display = 'block';
    bar.style.width = '10%';
    zone.classList.add('uploading');

    let processedFile = file;
    if (file.type.startsWith('image/')) {
      bar.style.width = '20%';
      processedFile = await this.compressImage(file);
      bar.style.width = '40%';
    }

    const formData = new FormData();
    formData.append('file', processedFile);
    formData.append('type', this.type);
    formData.append('context_id', this.contextId);
    Object.entries(this.extraFields).forEach(([k, v]) => formData.append(k, v));

    try {
      bar.style.width = '60%';
      const token = SVC.auth.getToken();
      const res = await fetch('/api/upload.php', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
      });

      bar.style.width = '90%';
      const data = await res.json();

      if (data.success && data.data) {
        bar.style.width = '100%';
        this.fileData = data.data;
        setTimeout(() => this.showPreview(data.data, file.name, processedFile.size), 300);
        if (this.onSuccess) this.onSuccess(data.data);
      } else {
        throw new Error(data.message || 'Error al subir');
      }
    } catch (err) {
      SVC.toast.error(err.message || 'Error al subir archivo');
      progress.style.display = 'none';
      bar.style.width = '0%';
      zone.classList.remove('uploading');
    }
  }

  showPreview(fileData, fileName, fileSize) {
    this.container.replaceChildren();

    const zone = document.createElement('div');
    zone.className = 'upload-zone uploaded';

    const isImage = fileData.mime_type?.startsWith('image/');

    if (isImage && fileData.thumbnail_url) {
      const img = document.createElement('img');
      img.src = fileData.thumbnail_url;
      img.className = 'upload-preview-img';
      img.alt = 'Preview';
      zone.appendChild(img);
    } else {
      const icon = document.createElement('div');
      icon.className = 'upload-zone-icon';
      icon.appendChild(this._fileIcon());
      zone.appendChild(icon);
    }

    const info = document.createElement('div');
    info.className = 'upload-preview-info';

    const name = document.createElement('div');
    name.className = 'upload-preview-name';
    name.textContent = fileName || 'Archivo';

    const size = document.createElement('div');
    size.className = 'upload-preview-size';
    const kb = fileSize ? (fileSize / 1024).toFixed(0) : '—';
    size.textContent = `${kb} KB — Subido`;

    info.append(name, size);

    const changeBtn = document.createElement('button');
    changeBtn.className = 'upload-change-btn';
    changeBtn.textContent = 'Cambiar archivo';
    changeBtn.type = 'button';
    changeBtn.addEventListener('click', () => this.render());

    zone.append(info, changeBtn);
    this.container.appendChild(zone);
  }
}
