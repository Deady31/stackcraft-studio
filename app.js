(function (global) {
  'use strict';

  const StackStudio = (global.StackStudio = global.StackStudio || {});

  document.addEventListener('DOMContentLoaded', () => {
    const stageCanvas = document.getElementById('stageCanvas');
    const sliceCanvas = document.getElementById('sliceCanvas');
    const workspace = document.getElementById('workspace');

    const engine = new StackStudio.SpriteStackEngine(stageCanvas);
    let currentModel = null;
    let isEditorOpen = false;
    let explodedToggle = false;

    // UI Elements
    const presetList = document.getElementById('presetList');
    const hudModelName = document.getElementById('hudModelName');
    const hudStats = document.getElementById('hudStats');
    const toastEl = document.getElementById('toast');

    const rngSpeed = document.getElementById('rngSpeed');
    const valSpeed = document.getElementById('valSpeed');
    const rngAmplitude = document.getElementById('rngAmplitude');
    const valAmplitude = document.getElementById('valAmplitude');
    const rngSpread = document.getElementById('rngSpread');
    const valSpread = document.getElementById('valSpread');
    const rngSliceCut = document.getElementById('rngSliceCut');
    const valSliceCut = document.getElementById('valSliceCut');
    const rngPitch = document.getElementById('rngPitch');
    const valPitch = document.getElementById('valPitch');
    const rngZoom = document.getElementById('rngZoom');
    const valZoom = document.getElementById('valZoom');

    const btnPlayPause = document.getElementById('btnPlayPause');
    const btnToggleExplode = document.getElementById('btnToggleExplode');

    const lblCurrentLayer = document.getElementById('lblCurrentLayer');
    const rngEditorLayer = document.getElementById('rngEditorLayer');
    const paletteGrid = document.getElementById('paletteGrid');
    const inpNewColor = document.getElementById('inpNewColor');

    let toastTimer = null;
    function showToast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.add('visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2400);
    }

    const editor = new StackStudio.SliceEditor(
      sliceCanvas,
      () => {
        engine.markModelDirty();
        syncLayerUI();
      },
      (colorIdx) => {
        renderPalette();
        showToast(`Couleur #${colorIdx} sélectionnée`);
      }
    );

    function syncControlsFromEngine() {
      rngSpeed.value = engine.speed;
      valSpeed.textContent = `${engine.speed.toFixed(1)}×`;

      rngAmplitude.value = engine.amplitude;
      valAmplitude.textContent = `${Math.round(engine.amplitude * 100)}%`;

      rngSpread.value = engine.spread;
      valSpread.textContent = `${engine.spread.toFixed(2)}×`;

      rngSliceCut.max = currentModel.height;
      rngSliceCut.value = engine.sliceCut;
      valSliceCut.textContent = `${engine.sliceCut}/${currentModel.height}`;

      rngPitch.value = engine.pitch;
      valPitch.textContent = `${Math.round(engine.pitch)}°`;

      rngZoom.value = engine.zoom;
      valZoom.textContent = `${engine.zoom.toFixed(1)}×`;

      document.querySelectorAll('#animModeList .chip').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.anim === engine.animMode);
      });
      btnPlayPause.textContent = engine.playing ? 'Pause' : 'Play';
      btnToggleExplode.classList.toggle('active', engine.spread > 1.35);
    }

    function syncLayerUI() {
      if (!currentModel) return;
      rngEditorLayer.max = currentModel.height - 1;
      rngEditorLayer.value = editor.currentZ;
      lblCurrentLayer.textContent = `${editor.currentZ + 1} / ${currentModel.height}`;
      engine.highlightSlice = isEditorOpen ? editor.currentZ : -1;
    }

    function renderPalette() {
      if (!currentModel) return;
      paletteGrid.innerHTML = '';
      currentModel.palette.forEach((entry, idx) => {
        if (!entry || idx === 0) return;
        const btn = document.createElement('button');
        btn.className = 'swatch' + (editor.selectedColor === idx ? ' active' : '');
        btn.style.backgroundColor = entry.hex;
        btn.title = `Couleur #${idx} (${entry.hex})${entry.emissive ? ' · Lumineux' : ''}`;
        btn.addEventListener('click', () => {
          editor.selectedColor = idx;
          if (editor.tool === 'eraser' || editor.tool === 'picker') {
            setEditorTool('brush');
          }
          renderPalette();
        });
        paletteGrid.appendChild(btn);
      });
    }

    function loadModel(model) {
      currentModel = model;
      engine.setModel(model, true);
      editor.setModel(model);
      hudModelName.textContent = `${model.icon || '✨'} ${model.name}`;
      syncControlsFromEngine();
      syncLayerUI();
      renderPalette();
      document.querySelectorAll('.preset-card').forEach((card) => {
        card.classList.toggle('active', card.dataset.id === model.id);
      });
    }

    // Build preset cards
    const builtPresets = StackStudio.PRESETS.map((p) => ({
      id: p.id,
      build: p.build,
      preview: p.build(),
    }));

    builtPresets.forEach((item) => {
      const m = item.preview;
      const btn = document.createElement('button');
      btn.className = 'preset-card';
      btn.dataset.id = item.id;
      btn.innerHTML = `
        <span class="preset-swatch">${m.icon}</span>
        <div class="preset-info">
          <div class="preset-name">${m.name}</div>
          <div class="preset-meta">${m.subtitle}</div>
        </div>
      `;
      btn.addEventListener('click', () => {
        loadModel(item.build());
        showToast(`Modèle chargé : ${m.name}`);
      });
      presetList.appendChild(btn);
    });

    // New Blank Project
    document.getElementById('btnNewBlank').addEventListener('click', () => {
      loadModel(StackStudio.buildBlankModel());
      setViewMode('split');
      editor.setLayer(6);
      syncLayerUI();
      showToast('Nouveau volume vierge prêt à sculpter !');
    });

    // View mode tabs (Studio vs Split Studio+Editor)
    function setViewMode(mode) {
      isEditorOpen = mode === 'split';
      workspace.classList.toggle('show-editor', isEditorOpen);
      document.querySelectorAll('#modeTabs .seg-btn').forEach((b) => {
        const active = b.dataset.view === mode;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      engine.highlightSlice = isEditorOpen ? editor.currentZ : -1;
      setTimeout(() => engine.resize(), 240);
    }

    document.querySelectorAll('#modeTabs .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => setViewMode(btn.dataset.view));
    });

    // Animation controls
    document.querySelectorAll('#animModeList .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        engine.animMode = btn.dataset.anim;
        if (!engine.playing && engine.animMode !== 'manual') {
          engine.playing = true;
        }
        syncControlsFromEngine();
      });
    });

    btnPlayPause.addEventListener('click', () => {
      engine.playing = !engine.playing;
      syncControlsFromEngine();
    });

    rngSpeed.addEventListener('input', () => {
      engine.speed = parseFloat(rngSpeed.value);
      valSpeed.textContent = `${engine.speed.toFixed(1)}×`;
    });

    rngAmplitude.addEventListener('input', () => {
      engine.amplitude = parseFloat(rngAmplitude.value);
      valAmplitude.textContent = `${Math.round(engine.amplitude * 100)}%`;
    });

    // Stack & Camera Sliders
    rngSpread.addEventListener('input', () => {
      engine.spread = parseFloat(rngSpread.value);
      valSpread.textContent = `${engine.spread.toFixed(2)}×`;
      btnToggleExplode.classList.toggle('active', engine.spread > 1.35);
    });

    rngSliceCut.addEventListener('input', () => {
      engine.sliceCut = parseInt(rngSliceCut.value, 10);
      valSliceCut.textContent = `${engine.sliceCut}/${currentModel.height}`;
    });

    rngPitch.addEventListener('input', () => {
      engine.pitch = parseFloat(rngPitch.value);
      valPitch.textContent = `${Math.round(engine.pitch)}°`;
    });

    rngZoom.addEventListener('input', () => {
      engine.zoom = parseFloat(rngZoom.value);
      valZoom.textContent = `${engine.zoom.toFixed(1)}×`;
    });

    document.getElementById('btnResetCam').addEventListener('click', () => {
      if (!currentModel) return;
      engine.yaw = currentModel.defaultYaw != null ? currentModel.defaultYaw : -0.45;
      engine.pitch = currentModel.defaultPitch != null ? currentModel.defaultPitch : 26;
      engine.zoom = currentModel.defaultZoom != null ? currentModel.defaultZoom : 3.2;
      engine.spread = 1.0;
      engine.sliceCut = currentModel.height;
      syncControlsFromEngine();
    });

    btnToggleExplode.addEventListener('click', () => {
      explodedToggle = engine.spread <= 1.35;
      engine.spread = explodedToggle ? 2.4 : 1.0;
      syncControlsFromEngine();
      showToast(explodedToggle ? 'Vue éclatée : couches séparées' : 'Vue compacte pseudo-3D');
    });

    // Background modes & Toggles
    document.querySelectorAll('#bgModeList .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        engine.bgMode = btn.dataset.bg;
        document.querySelectorAll('#bgModeList .chip').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
      });
    });

    document.getElementById('chkOutline').addEventListener('change', (e) => {
      engine.showOutline = e.target.checked;
    });
    document.getElementById('chkCrevice').addEventListener('change', (e) => {
      engine.showCrevice = e.target.checked;
    });
    document.getElementById('chkShading').addEventListener('change', (e) => {
      engine.showShading = e.target.checked;
    });
    document.getElementById('chkPedestal').addEventListener('change', (e) => {
      engine.showPedestal = e.target.checked;
    });
    document.getElementById('chkParticles').addEventListener('change', (e) => {
      engine.showParticles = e.target.checked;
    });

    // Interactive Viewport Orbit & Zoom
    let draggingStage = false;
    let lastX = 0;
    let lastY = 0;

    stageCanvas.addEventListener('pointerdown', (ev) => {
      draggingStage = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      stageCanvas.setPointerCapture(ev.pointerId);
    });

    stageCanvas.addEventListener('pointermove', (ev) => {
      if (!draggingStage) return;
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      engine.yaw += dx * 0.011;
      engine.pitch = Math.max(5, Math.min(75, engine.pitch + dy * 0.25));
      rngPitch.value = engine.pitch;
      valPitch.textContent = `${Math.round(engine.pitch)}°`;
    });

    const endDrag = () => {
      draggingStage = false;
    };
    stageCanvas.addEventListener('pointerup', endDrag);
    stageCanvas.addEventListener('pointercancel', endDrag);

    stageCanvas.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        const delta = ev.deltaY > 0 ? -0.3 : 0.3;
        engine.zoom = Math.max(2.0, Math.min(10.0, +(engine.zoom + delta).toFixed(2)));
        rngZoom.value = engine.zoom;
        valZoom.textContent = `${engine.zoom.toFixed(1)}×`;
      },
      { passive: false }
    );

    // Editor Tool Controls
    function setEditorTool(tool) {
      editor.tool = tool;
      document.querySelectorAll('#editorTools .tool-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.tool === tool);
      });
    }

    document.querySelectorAll('#editorTools .tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => setEditorTool(btn.dataset.tool));
    });

    document.querySelectorAll('.size-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        editor.brushSize = parseInt(btn.dataset.size, 10);
        document.querySelectorAll('.size-btn').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
      });
    });

    document.getElementById('btnSymX').addEventListener('click', (e) => {
      editor.symX = !editor.symX;
      e.currentTarget.classList.toggle('active', editor.symX);
      editor.render();
    });
    document.getElementById('btnSymY').addEventListener('click', (e) => {
      editor.symY = !editor.symY;
      e.currentTarget.classList.toggle('active', editor.symY);
      editor.render();
    });
    document.getElementById('btnOnion').addEventListener('click', (e) => {
      editor.onionSkin = !editor.onionSkin;
      e.currentTarget.classList.toggle('active', editor.onionSkin);
      editor.render();
    });

    // Layer navigation & operations
    rngEditorLayer.addEventListener('input', () => {
      editor.setLayer(parseInt(rngEditorLayer.value, 10));
      syncLayerUI();
    });
    document.getElementById('btnLayerUp').addEventListener('click', () => {
      editor.setLayer(editor.currentZ + 1);
      syncLayerUI();
    });
    document.getElementById('btnLayerDown').addEventListener('click', () => {
      editor.setLayer(editor.currentZ - 1);
      syncLayerUI();
    });
    document.getElementById('btnDupUp').addEventListener('click', () => {
      if (editor.duplicateLayer(1)) {
        syncLayerUI();
        showToast(`Couche copiée vers Z=${editor.currentZ + 1}`);
      }
    });
    document.getElementById('btnDupDown').addEventListener('click', () => {
      if (editor.duplicateLayer(-1)) {
        syncLayerUI();
        showToast(`Couche copiée vers Z=${editor.currentZ + 1}`);
      }
    });
    document.getElementById('btnMirrorSlice').addEventListener('click', () => {
      editor.mirrorLayerX();
      showToast('Couche inversée en miroir X');
    });
    document.getElementById('btnClearSlice').addEventListener('click', () => {
      editor.clearLayer();
      showToast(`Couche Z=${editor.currentZ + 1} effacée`);
    });
    document.getElementById('btnUndo').addEventListener('click', () => {
      if (editor.undo()) syncLayerUI();
    });
    document.getElementById('btnRedo').addEventListener('click', () => {
      if (editor.redo()) syncLayerUI();
    });

    // Add custom palette color
    inpNewColor.addEventListener('change', () => {
      if (!currentModel) return;
      const newIdx = currentModel.palette.length;
      currentModel.palette.push({ hex: inpNewColor.value, group: newIdx });
      engine.markModelDirty();
      editor.selectedColor = newIdx;
      renderPalette();
      showToast(`Couleur ${inpNewColor.value} ajoutée`);
    });

    // Download helper
    function triggerDownload(url, filename) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // Export Sprite-Sheet PNG
    document.getElementById('btnExportSheet').addEventListener('click', () => {
      const url = engine.exportSpriteSheetDataURL();
      if (!url) return;
      triggerDownload(url, `${currentModel.id}-spritesheet-${currentModel.height}layers.png`);
      showToast(`Sprite-Sheet PNG exportée (${currentModel.height} couches)`);
    });

    // Snapshot PNG
    document.getElementById('btnSnapPng').addEventListener('click', () => {
      const url = engine.exportSnapshotDataURL();
      triggerDownload(url, `${currentModel.id}-snapshot.png`);
      showToast('Capture PNG téléchargée');
    });

    // Export / Import JSON
    document.getElementById('btnExportJson').addEventListener('click', () => {
      const json = StackStudio.serializeModel(currentModel);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${currentModel.id}-stackcraft.json`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Projet JSON sauvegardé');
    });

    const fileImportJson = document.getElementById('fileImportJson');
    document.getElementById('btnImportJson').addEventListener('click', () => {
      fileImportJson.click();
    });
    fileImportJson.addEventListener('change', () => {
      const file = fileImportJson.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = StackStudio.deserializeModel(reader.result);
          loadModel(imported);
          showToast(`Projet importé : ${imported.name}`);
        } catch (err) {
          showToast('Erreur : fichier JSON invalide');
        }
      };
      reader.readAsText(file);
      fileImportJson.value = '';
    });

    // =========================================================================
    // IMAGE -> 3D SPRITE STACK (Drag & Drop, File Picker, Ctrl+V Clipboard!)
    // =========================================================================
    const fileImportImage = document.getElementById('fileImportImage');
    const dropOverlay = document.getElementById('dropOverlay');
    const img3dCard = document.getElementById('img3dCard');
    const img3dPreview = document.getElementById('img3dPreview');
    const img3dPreviewCtx = img3dPreview.getContext('2d');

    const rngImgRes = document.getElementById('rngImgRes');
    const valImgRes = document.getElementById('valImgRes');
    const rngImgColors = document.getElementById('rngImgColors');
    const valImgColors = document.getElementById('valImgColors');
    const rngImgDepth = document.getElementById('rngImgDepth');
    const valImgDepth = document.getElementById('valImgDepth');
    const chkImgRemoveBg = document.getElementById('chkImgRemoveBg');
    const rngImgBgTol = document.getElementById('rngImgBgTol');
    const valImgBgTol = document.getElementById('valImgBgTol');
    const rowImgBgTol = document.getElementById('rowImgBgTol');

    let loadedSourceImage = null;
    let loadedSourceName = 'Mon Perso 3D';
    const img3dOpts = {
      resolution: 38,
      colors: 14,
      depthScale: 12,
      mode: 'puffy',
      orientation: 'standing',
      removeBg: true,
      bgTolerance: 36,
    };

    function rebuildFromSourceImage(resetCamera) {
      if (!loadedSourceImage) return;
      const result = StackStudio.imageToSpriteStack(loadedSourceImage, {
        ...img3dOpts,
        name: loadedSourceName,
      });

      // Draw crisp 2D pixel-art preview into card
      const pc = result.previewCanvas;
      img3dPreviewCtx.clearRect(0, 0, img3dPreview.width, img3dPreview.height);
      img3dPreviewCtx.imageSmoothingEnabled = false;
      const sc = Math.min(img3dPreview.width / pc.width, img3dPreview.height / pc.height);
      const dw = Math.round(pc.width * sc);
      const dh = Math.round(pc.height * sc);
      const dx = Math.floor((img3dPreview.width - dw) * 0.5);
      const dy = Math.floor((img3dPreview.height - dh) * 0.5);
      img3dPreviewCtx.drawImage(pc, dx, dy, dw, dh);

      // Update live 3D model on stage (preserve camera angle when tweaking sliders!)
      const prevYaw = engine.yaw;
      const prevPitch = engine.pitch;
      const prevZoom = engine.zoom;
      const prevAnim = engine.animMode;

      currentModel = result.model;
      engine.setModel(currentModel, resetCamera);
      if (!resetCamera) {
        engine.yaw = prevYaw;
        engine.pitch = prevPitch;
        engine.zoom = prevZoom;
        engine.animMode = prevAnim;
        engine.sliceCut = currentModel.height;
      }
      editor.setModel(currentModel);
      hudModelName.textContent = `🖼️ ${currentModel.name}`;
      syncControlsFromEngine();
      syncLayerUI();
      renderPalette();
      document.querySelectorAll('.preset-card').forEach((c) => c.classList.remove('active'));
    }

    function handleImageFile(file) {
      if (!file || !file.type.startsWith('image/')) {
        showToast('Dépose une image PNG, JPG ou WebP !');
        return;
      }
      const cleanName = (file.name || 'Mon Perso 3D')
        .replace(/\.[^.]+$/, '')
        .slice(0, 22);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        loadedSourceImage = img;
        loadedSourceName = cleanName || 'Mon Perso 3D';
        img3dCard.hidden = false;
        rebuildFromSourceImage(true);
        showToast(`✨ "${loadedSourceName}" transformé en Sprite-Stack 3D !`);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        showToast("Impossible de lire cette image");
      };
      img.src = url;
    }

    document.getElementById('btnImageTo3D').addEventListener('click', () => {
      if (loadedSourceImage && img3dCard.hidden) {
        img3dCard.hidden = false;
      } else {
        fileImportImage.click();
      }
    });

    document.getElementById('btnPickAnotherImg').addEventListener('click', () => {
      fileImportImage.click();
    });

    fileImportImage.addEventListener('change', () => {
      if (fileImportImage.files[0]) {
        handleImageFile(fileImportImage.files[0]);
        fileImportImage.value = '';
      }
    });

    document.getElementById('btnCloseImg3d').addEventListener('click', () => {
      img3dCard.hidden = true;
    });
    document.getElementById('btnImgDone').addEventListener('click', () => {
      img3dCard.hidden = true;
      showToast('Prêt ! Tu peux exporter en Sprite-Sheet PNG ou Clip WebM');
    });
    document.getElementById('btnImgOpenEditor').addEventListener('click', () => {
      img3dCard.hidden = true;
      setViewMode('split');
    });

    // Live Image->3D sliders & chips
    document.querySelectorAll('#img3dModeList .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        img3dOpts.mode = btn.dataset.mode;
        document.querySelectorAll('#img3dModeList .chip').forEach((b) => b.classList.toggle('active', b === btn));
        rebuildFromSourceImage(false);
      });
    });

    document.querySelectorAll('#img3dOrientList .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        img3dOpts.orientation = btn.dataset.orient;
        document.querySelectorAll('#img3dOrientList .chip').forEach((b) => b.classList.toggle('active', b === btn));
        rebuildFromSourceImage(true);
      });
    });

    rngImgRes.addEventListener('input', () => {
      img3dOpts.resolution = parseInt(rngImgRes.value, 10);
      valImgRes.textContent = `${img3dOpts.resolution} px`;
      rebuildFromSourceImage(false);
    });

    rngImgColors.addEventListener('input', () => {
      img3dOpts.colors = parseInt(rngImgColors.value, 10);
      valImgColors.textContent = `${img3dOpts.colors}`;
      rebuildFromSourceImage(false);
    });

    rngImgDepth.addEventListener('input', () => {
      img3dOpts.depthScale = parseInt(rngImgDepth.value, 10);
      valImgDepth.textContent = `${img3dOpts.depthScale}`;
      rebuildFromSourceImage(false);
    });

    chkImgRemoveBg.addEventListener('change', () => {
      img3dOpts.removeBg = chkImgRemoveBg.checked;
      rowImgBgTol.style.opacity = img3dOpts.removeBg ? '1' : '0.45';
      rebuildFromSourceImage(false);
    });

    rngImgBgTol.addEventListener('input', () => {
      img3dOpts.bgTolerance = parseInt(rngImgBgTol.value, 10);
      valImgBgTol.textContent = `${img3dOpts.bgTolerance}`;
      rebuildFromSourceImage(false);
    });

    // Global Drag & Drop anywhere on the window
    let dragCounter = 0;
    window.addEventListener('dragenter', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        dragCounter++;
        dropOverlay.classList.add('active');
      }
    });
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
      }
    });
    window.addEventListener('dragleave', () => {
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) dropOverlay.classList.remove('active');
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropOverlay.classList.remove('active');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (file.name.toLowerCase().endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            loadModel(StackStudio.deserializeModel(reader.result));
            showToast('Projet JSON chargé !');
          } catch (err) {
            showToast('Fichier JSON invalide');
          }
        };
        reader.readAsText(file);
      } else {
        handleImageFile(file);
      }
    });

    // Paste image directly from clipboard (Ctrl+V)!
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            handleImageFile(new File([blob], 'Image Collée.png', { type: blob.type }));
            return;
          }
        }
      }
    });

    // WebM Video Loop Recorder
    const btnRecordLoop = document.getElementById('btnRecordLoop');
    const recordBtnLabel = document.getElementById('recordBtnLabel');
    let recorder = null;
    let recChunks = [];
    let recStopTimeout = null;

    function stopRecording() {
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      clearTimeout(recStopTimeout);
      btnRecordLoop.classList.remove('recording');
      recordBtnLabel.textContent = 'Clip WebM';
    }

    btnRecordLoop.addEventListener('click', () => {
      if (recorder && recorder.state === 'recording') {
        stopRecording();
        return;
      }
      if (typeof MediaRecorder === 'undefined' || !stageCanvas.captureStream) {
        showToast('Enregistrement WebM non supporté par ce navigateur');
        return;
      }
      try {
        const stream = stageCanvas.captureStream(60);
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm';
        recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
        recChunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recChunks.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(recChunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          triggerDownload(url, `${currentModel.id}-loop.webm`);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          showToast('Clip vidéo WebM téléchargé !');
        };
        recorder.start();
        btnRecordLoop.classList.add('recording');
        recordBtnLabel.textContent = 'Stop (4s)...';
        showToast('Enregistrement en cours (4 secondes)...');
        recStopTimeout = setTimeout(stopRecording, 4000);
      } catch (err) {
        showToast("Impossible de démarrer l'enregistrement");
      }
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        engine.playing = !engine.playing;
        syncControlsFromEngine();
      } else if (e.key === 'e' || e.key === 'E') {
        setViewMode(isEditorOpen ? 'studio' : 'split');
      } else if (e.key === 'ArrowUp' && isEditorOpen) {
        e.preventDefault();
        editor.setLayer(editor.currentZ + 1);
        syncLayerUI();
      } else if (e.key === 'ArrowDown' && isEditorOpen) {
        e.preventDefault();
        editor.setLayer(editor.currentZ - 1);
        syncLayerUI();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (editor.undo()) syncLayerUI();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (editor.redo()) syncLayerUI();
      } else if (isEditorOpen) {
        const k = e.key.toLowerCase();
        if (k === 'b') setEditorTool('brush');
        else if (k === 'x') setEditorTool('eraser');
        else if (k === 'g') setEditorTool('fill');
        else if (k === 'i') setEditorTool('picker');
      }
    });

    // Resize observer
    window.addEventListener('resize', () => engine.resize());

    // Load default flagship model: Blåhaj Shark Plushie!
    loadModel(builtPresets[0].build());

    // Animation loop
    let prevTs = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - prevTs) / 1000);
      prevTs = now;
      engine.step(dt);
      engine.render();

      if (currentModel) {
        hudStats.textContent = `${currentModel.height} couches · ${currentModel.voxelCount || 0} voxels · ${engine.fps} FPS`;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  });
})(window);
