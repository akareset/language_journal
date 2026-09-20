// Optional local WebView2 inspection helper. Start Tauri with
// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 first.
// No production code imports this file. Expressions are supplied explicitly.
import { writeFile } from 'node:fs/promises';
const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = pages.find(page => page.title === 'Language Journal');
if (!page) throw new Error('Language Journal WebView not found');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const requests = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  const pending = requests.get(message.id);
  if (pending) {
    requests.delete(message.id);
    if (message.error) pending.reject(message.error); else pending.resolve(message.result);
  }
};
function send(method, params) {
  return new Promise((resolve, reject) => {
    requests.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
const mode = process.argv[2] ?? 'inspect';
try {
  if (mode === 'viewport') {
    await send('Emulation.setDeviceMetricsOverride', { width: Number(process.argv[3]), height: Number(process.argv[4]), deviceScaleFactor: 1, mobile: false });
    console.log('Viewport updated');
  } else if (mode === 'reload') {
    await send('Page.reload', {});
    console.log('Reload requested');
  } else if (mode === 'screenshot') {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(process.argv[3], Buffer.from(result.data, 'base64'));
    console.log('Screenshot captured');
  } else if (mode === 'type') {
    await send('Runtime.evaluate', { expression: `document.querySelector('.tiptap').focus()` });
    await send('Input.insertText', { text: process.argv[3] });
  } else {
    const expression = mode === 'eval' ? process.argv[3] : `JSON.stringify({text:document.body.innerText,editor:document.querySelector('.tiptap')?.innerHTML,editors:document.querySelectorAll('.tiptap').length})`;
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    console.log(result.result.value ?? result.result.description);
  }
} finally {
  socket.close();
}
