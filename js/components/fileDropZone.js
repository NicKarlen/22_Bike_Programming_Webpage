// Drag-and-drop + multi-select file picker for GPX/TCX activity import.

export function buildFileDropZone({ onFiles }) {
  const zone = document.createElement('div');
  zone.className = 'file-drop-zone';
  zone.innerHTML = `
    <input type="file" id="activity-file-input" multiple accept=".gpx,.tcx,application/gpx+xml" hidden>
    <div class="drop-zone-inner">
      <div class="drop-zone-icon">🚴</div>
      <p><strong>Drop GPX/TCX files here</strong></p>
      <p class="drop-zone-hint">or tap to choose one or many files from your phone/computer</p>
      <button type="button" class="btn btn-primary" id="choose-files-btn">Choose files</button>
    </div>
  `;

  const input = zone.querySelector('#activity-file-input');
  const chooseBtn = zone.querySelector('#choose-files-btn');

  chooseBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files.length) onFiles(input.files);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('drag-active');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.remove('drag-active');
    });
  });
  zone.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files?.length) onFiles(files);
  });

  return zone;
}
