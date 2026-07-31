import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.HUAHAI_QA_BASE || 'http://127.0.0.1:3000';
const port = Number(process.env.HUAHAI_CDP_PORT || 9223);
const width = Number(process.env.HUAHAI_QA_WIDTH || 1920);
const height = Number(process.env.HUAHAI_QA_HEIGHT || 1080);
const outputDir = path.resolve(process.env.HUAHAI_QA_OUTPUT || `docs/screenshots/2026.08.01.1/actual-${width}x${height}`);
const viewport = { width, height, deviceScaleFactor: 1, mobile: width < 720 };
await fs.mkdir(outputDir, { recursive: true });

async function newPage(url) {
    const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    if (!response.ok) throw new Error(`CDP new page failed: ${response.status}`);
    return response.json();
}

async function connect(webSocketDebuggerUrl) {
    const socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    const consoleErrors = [];
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) reject(new Error(message.error.message));
            else resolve(message.result || {});
        }
        if (message.method === 'Runtime.exceptionThrown') {
            consoleErrors.push(message.params?.exceptionDetails?.text || 'Runtime exception');
        }
        if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
            consoleErrors.push(message.params.entry.text);
        }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
    return { socket, send, consoleErrors };
}

async function wait(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function createQaCanvas() {
    const createdResponse = await fetch(`${base}/api/canvases`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            title: '海报智能构图 · 视觉验收',
            icon: 'layers',
            kind: 'smart',
            project: 'default'
        })
    });
    if (!createdResponse.ok) throw new Error(`QA canvas create failed: ${createdResponse.status}`);
    const created = await createdResponse.json();
    const item = created.canvas || created;
    const canvasId = String(item.id || '');
    if (!canvasId) throw new Error('QA canvas create returned no id');
    const image = {
        url: '/static/images/huahai-home-preview.png',
        name: '花海视觉参考.png',
        mediaKind: 'image',
        natural_w: 1536,
        natural_h: 1024
    };
    const nodes = [
        {
            id: 'qa-prompt',
            type: 'smart-prompt',
            x: 120,
            y: 210,
            w: 316,
            h: 230,
            title: '提示词',
            text: '深海科技风海报，未来感，数据流，发光纹理，产品发布，简洁布局，高对比，电影级光效。',
            images: []
        },
        {
            id: 'qa-material',
            type: 'smart-image',
            x: 120,
            y: 520,
            title: '素材',
            images: [image],
            scale: 1
        },
        {
            id: 'qa-api',
            type: 'smart-image',
            x: 620,
            y: 320,
            title: 'API 生成',
            images: [],
            scale: 1,
            runSettings: {
                engine: 'api',
                apiKind: 'image',
                provider_id: 'custom-api',
                model: 'gpt-image-2',
                ratio: 'landscape',
                resolution: '4k',
                quality: 'high',
                count: 1,
                promptH: 124
            }
        },
        {
            id: 'qa-plugin',
            type: 'smart-image',
            x: 1030,
            y: 320,
            title: '插件生成',
            images: [],
            scale: 1,
            runSettings: {
                engine: 'plugin',
                apiKind: 'image',
                pluginId: 'gemini-creator',
                ratio: 'landscape',
                resolution: '4k',
                quality: 'high',
                count: 1,
                promptH: 124
            }
        },
        {
            id: 'qa-output',
            type: 'smart-image',
            x: 1450,
            y: 285,
            title: '输出',
            images: [image],
            scale: 1
        }
    ];
    const connections = [
        { id: 'qa-c1', from: 'qa-prompt', to: 'qa-api', kind: 'input' },
        { id: 'qa-c2', from: 'qa-material', to: 'qa-api', kind: 'input' },
        { id: 'qa-c3', from: 'qa-api', to: 'qa-plugin', kind: 'input' },
        { id: 'qa-c4', from: 'qa-plugin', to: 'qa-output', kind: 'input' }
    ];
    const savedResponse = await fetch(`${base}/api/canvases/${encodeURIComponent(canvasId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            title: '海报智能构图 · 视觉验收',
            icon: 'layers',
            nodes,
            connections,
            viewport: { x: 120, y: 30, scale: 0.78 },
            logs: [],
            settings: {
                engine: 'api',
                apiKind: 'image',
                provider_id: 'custom-api',
                model: 'gpt-image-2',
                ratio: 'landscape',
                resolution: '4k',
                quality: 'high',
                count: 1
            },
            client_id: 'visual-qa',
            base_updated_at: 0
        })
    });
    if (!savedResponse.ok) {
        await fetch(`${base}/api/canvases/${encodeURIComponent(canvasId)}`, { method: 'DELETE' }).catch(() => {});
        await fetch(`${base}/api/canvases/${encodeURIComponent(canvasId)}/purge`, { method: 'DELETE' }).catch(() => {});
        throw new Error(`QA canvas save failed: ${savedResponse.status} ${await savedResponse.text()}`);
    }
    return canvasId;
}

async function purgeQaCanvas(canvasId) {
    if (!canvasId) return;
    await fetch(`${base}/api/canvases/${encodeURIComponent(canvasId)}`, { method: 'DELETE' }).catch(() => {});
    await fetch(`${base}/api/canvases/${encodeURIComponent(canvasId)}/purge`, { method: 'DELETE' }).catch(() => {});
}

async function capture(name, url, setupExpression = '', settleMs = 3200, pointer = null) {
    const target = await newPage(url);
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', viewport);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try {
            localStorage.setItem('studio_theme', 'dark');
            localStorage.setItem('canvas_theme', 'dark');
        } catch (_) {}`
    });
    await cdp.send('Page.navigate', { url });
    await wait(settleMs);
    if (setupExpression) {
        await cdp.send('Runtime.evaluate', { expression: setupExpression, awaitPromise: true, returnByValue: true });
        await wait(700);
    }
    if (pointer) {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pointer.x, y: pointer.y });
        await wait(320);
    }
    const audit = await cdp.send('Runtime.evaluate', {
        expression: `(() => ({
            title: document.title,
            bodyWidth: document.body.scrollWidth,
            bodyHeight: document.body.scrollHeight,
            viewport: [innerWidth, innerHeight],
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
            dialogs: [...document.querySelectorAll('dialog[open]')].length,
            visibleText: document.body.innerText.slice(0, 4000)
        }))()`,
        returnByValue: true
    });
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
    const file = path.join(outputDir, `${name}.png`);
    await fs.writeFile(file, Buffer.from(shot.data, 'base64'));
    await cdp.send('Page.close').catch(() => {});
    cdp.socket.close();
    return { name, url, file, audit: audit.result?.value || {}, consoleErrors: cdp.consoleErrors };
}

const results = [];
results.push(await capture('01-home', `${base}/`, `(() => {
    const trigger = document.querySelector('.nav-item[onclick*="home"]');
    if (window.switchUI) window.switchUI(trigger, 'home', {skipRemember:true});
})()`, 5200));
results.push(await capture('02-project-manager', `${base}/static/canvas-list.html`, '', 3200, {x:430,y:260}));
let qaCanvasId = '';
try {
    qaCanvasId = await createQaCanvas();
    const canvasUrl = `${base}/static/smart-canvas.html?id=${encodeURIComponent(qaCanvasId)}`;
    results.push(await capture('03-smart-canvas', canvasUrl, `(() => {
        document.querySelector('.smart-designer-rail')?.classList.add('qa-open');
        if (typeof fitAllNodesViewport === 'function') fitAllNodesViewport();
    })()`, 3600, {x:34,y:300}));
    results.push(await capture('04-batch-link', canvasUrl, `(() => {
        document.querySelector('.smart-designer-rail')?.classList.add('qa-open');
        if (typeof fitAllNodesViewport === 'function') fitAllNodesViewport();
        selectedId = 'qa-prompt';
        selectedIds = ['qa-prompt', 'qa-material', 'qa-api'];
        if (typeof syncSelectionUi === 'function') syncSelectionUi();
    })()`, 3600, {x:34,y:300}));
    results.push(await capture('05-api-generation', canvasUrl, `(async () => {
        document.querySelector('.smart-designer-rail')?.classList.add('qa-open');
        if (typeof fitAllNodesViewport === 'function') fitAllNodesViewport();
        selectedId = 'qa-api';
        selectedIds = ['qa-api'];
        if (typeof syncSelectionUi === 'function') syncSelectionUi();
        if (typeof updateComposer === 'function') updateComposer();
        await new Promise(resolve => setTimeout(resolve, 450));
        const select = document.getElementById('engineSelect');
        if (select) {
            select.value = 'api';
            select.dispatchEvent(new Event('change', {bubbles:true}));
        }
    })()`, 3600, {x:34,y:300}));
    results.push(await capture('06-plugin-generation', canvasUrl, `(async () => {
        document.querySelector('.smart-designer-rail')?.classList.add('qa-open');
        if (typeof fitAllNodesViewport === 'function') fitAllNodesViewport();
        selectedId = 'qa-api';
        selectedIds = ['qa-api'];
        if (typeof syncSelectionUi === 'function') syncSelectionUi();
        if (typeof updateComposer === 'function') updateComposer();
        await new Promise(resolve => setTimeout(resolve, 450));
        const select = document.getElementById('engineSelect');
        if (select) {
            select.value = 'plugin';
            select.dispatchEvent(new Event('change', {bubbles:true}));
            await new Promise(resolve => setTimeout(resolve, 360));
            document.querySelector('#dynamicParams .provider-control > .smart-pill')?.click();
        }
    })()`, 3600, {x:34,y:300}));
    results.push(await capture('07-results-rail', canvasUrl, `(() => {
        document.querySelector('.smart-results-rail-btn[data-smart-results-kind="all"]')?.click();
    })()`, 3600));
} finally {
    await purgeQaCanvas(qaCanvasId);
}
results.push(await capture('08-plugin-center', `${base}/static/plugin-center.html`));

await fs.writeFile(
    path.join(outputDir, 'visual-qa-report.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), viewport, results }, null, 2),
    'utf8'
);
console.log(JSON.stringify(results.map(item => ({
    name: item.name,
    file: item.file,
    overflow: item.audit.horizontalOverflow,
    consoleErrors: item.consoleErrors
})), null, 2));
