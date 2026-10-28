# Demo recordings

Four looping 1200 × 800 GIFs, each 10 seconds. These capture the real React interface in isolated Edge, with synthetic journal data and simulated Tauri/AI responses. Interaction pauses are edited for brevity. No provider, credential store, or real database is accessed. The footer identifies the sample content.

To regenerate from the repository root, start Vite in one terminal:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

Launch an isolated browser and record in another terminal:

```powershell
Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList '--headless=new','--remote-debugging-port=9223','--user-data-dir=D:\Projects\german-notes\.ui-test-browser','--no-first-run','about:blank' -WindowStyle Hidden
node scripts/record-demos.mjs
python scripts/encode-demos.py
```

Encoding requires Pillow in the selected Python environment. The recorder closes its browser when finished; stop Vite afterward. Temporary frames and the isolated browser profile are Git-ignored. Fixtures and capture code live in `scripts/demo-fixtures.mjs` and `scripts/record-demos.mjs`. The encoder checks dimensions and duration and uses a shared palette to reduce flicker.
