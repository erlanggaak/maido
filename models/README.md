# Maido models

Put your `.vrm` files directly in this folder, for example:

```
models/
  maido.vrm
  maido-casual.vrm
  maido-evening.vrm
```

Maido scans this folder at startup. Use the model selector to switch characters,
or its refresh button after adding/removing files while the app is running.
No upload is needed. Models are served only by Maido's localhost server.

- VRM 1.0 and legacy VRM 0.x are accepted through three-vrm.
- Export a self-contained `.vrm` from VRoid Studio, not the editable `.vroid` file.
- Each file must be non-empty and at most 150 MB. Subfolders and symlinks are skipped.
- The last successfully loaded choice is remembered in this browser.
- On first use, `MAIDO_DEFAULT_MODEL=maido.vrm` in `.env` selects a startup model.
  Otherwise the first filename alphabetically is selected.
- Without a model, the app displays the built-in temporary mascot.
- VRM and VRoid files are ignored by Git.

Use only avatars you have permission to use. No third-party avatar is bundled.
