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
            icon: 'sparkles',
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
            w: 460,
            h: 292,
            title: '提示词',
            text: '深海科技风海报，未来感，数据流，发光纹理，产品发布，简洁布局，高对比，电影级光效。',
            images: []
        },
        {
            id: 'qa-material',
            type: 'smart-image',
            x: 120,
            y: 465,
            title: '素材',
            images: [image],
            scale: 1.8
        },
        {
            id: 'qa-api',
            type: 'smart-image',
            x: 620,
            y: 320,
            title: 'API 生成',
            images: [],
            scale: 1.5,
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
            scale: 1.5,
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
            scale: 1.8
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
            icon: 'sparkles',
            nodes,
            connections,
            viewport: { x: 120, y: 30, scale: 0.63 },
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

async function createProjectManagerFixtures() {
    const projectResponse = await fetch(`${base}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '潮汐项目 · 视觉验收' })
    });
    if (!projectResponse.ok) throw new Error(`Project fixture group create failed: ${projectResponse.status}`);
    const projectBody = await projectResponse.json();
    const projectId = String(projectBody.project?.id || '');
    if (!projectId) throw new Error('Project fixture group returned no project id');
    const titles = ['海报设计', '品牌提案', '视觉探索', '动态概念', '字体实验', '产品草图', '插画创作', '界面探索'];
    const ids = [];
    for (const title of titles) {
        const response = await fetch(`${base}/api/canvases`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title, icon: 'layers', kind: 'smart', project: projectId })
        });
        if (!response.ok) throw new Error(`Project fixture create failed: ${response.status}`);
        const body = await response.json();
        const id = String((body.canvas || body).id || '');
        if (!id) throw new Error('Project fixture returned no canvas id');
        ids.push(id);
    }
    return { projectId, ids };
}

async function purgeQaCanvases(ids) {
    for (const id of ids || []) await purgeQaCanvas(id);
}

async function purgeQaCanvas(canvasId) {
    if (!canvasId) return;
    await fetch(`${base}/api/canvases/${encodeURIComponent(canvasId)}`, { method: 'DELETE' }).catch(() => {});
    await fetch(`${base}/api/canvases/${encodeURIComponent(canvasId)}/purge`, { method: 'DELETE' }).catch(() => {});
}

async function capture(name, url, setupExpression = '', settleMs = 3200, pointer = null) {
    // Attach CDP before the application starts loading. Opening the final URL first
    // lets the page read stale localStorage and render before our QA bootstrap is
    // installed, which made project-manager captures intermittently show the
    // default project instead of the dedicated fixture project.
    const target = await newPage('about:blank');
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
            const qaProject = new URL(location.href).searchParams.get('qaProject');
            if (qaProject) localStorage.setItem('canvasListCurrentProjectId', qaProject);
        } catch (_) {}`
    });
    await cdp.send('Page.navigate', { url });
    await wait(settleMs);
    if (url.includes('/static/smart-canvas.html')) {
        await cdp.send('Runtime.evaluate', {
            expression: `(async () => {
                for (let attempt = 0; attempt < 120; attempt += 1) {
                    const ready = typeof nodes !== 'undefined'
                        && Array.isArray(nodes)
                        && nodes.some(node => node?.id === 'qa-prompt')
                        && document.title.includes('视觉验收');
                    if (ready) return true;
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                throw new Error('QA smart canvas did not load fixture nodes');
            })()`,
            awaitPromise: true,
            returnByValue: true
        });
    }
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
            appNodeCount: typeof nodes !== 'undefined' && Array.isArray(nodes) ? nodes.length : null,
            selectedNodeCount: typeof selectedIds !== 'undefined' && Array.isArray(selectedIds) ? selectedIds.length : null,
            projectCardCount: document.querySelectorAll('.hh-canvas-card').length,
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
let projectFixture = null;
let qaCanvasId = '';
try {
    results.push(await capture('01-home', `${base}/`, `(() => {
        const trigger = document.querySelector('.nav-item[onclick*="home"]');
        if (window.switchUI) window.switchUI(trigger, 'home', {skipRemember:true});
    })()`, 5200));
    projectFixture = await createProjectManagerFixtures();
    results.push(await capture('02-project-manager', `${base}/static/canvas-list.html?qaProject=${encodeURIComponent(projectFixture.projectId)}`, '', 3200, {x:430,y:260}));
    qaCanvasId = await createQaCanvas();
    const canvasUrl = `${base}/static/smart-canvas.html?id=${encodeURIComponent(qaCanvasId)}`;
    results.push(await capture('03-smart-canvas', canvasUrl, `(() => {
        document.querySelector('.smart-designer-rail')?.classList.add('qa-open');
        viewport.scale = .63;
        viewport.x = 118;
        viewport.y = 24;
        if (typeof applyViewport === 'function') applyViewport();
    })()`, 3600, {x:34,y:300}));
    results.push(await capture('04-batch-link', canvasUrl, `(() => {
        document.querySelector('.smart-designer-rail')?.classList.add('qa-open');
        selectedId = 'qa-prompt';
        selectedIds = ['qa-prompt', 'qa-material', 'qa-api'];
        if (typeof syncSelectionUi === 'function') syncSelectionUi();
        viewport.scale = .63;
        viewport.x = 118;
        viewport.y = 24;
        if (typeof applyViewport === 'function') applyViewport();
    })()`, 3600, {x:34,y:300}));
    results.push(await capture('05-api-generation', canvasUrl, `(async () => {
        document.querySelector('.smart-designer-rail')?.classList.add('qa-open');
        nodes = nodes.filter(node => node.id !== 'qa-plugin');
        const output = nodes.find(node => node.id === 'qa-output');
        if (output) {
            output.x = 1260;
            output.y = 285;
        }
        if (canvas) {
            canvas.connections = [
                { id: 'qa-c1', from: 'qa-prompt', to: 'qa-api', kind: 'input' },
                { id: 'qa-c2', from: 'qa-material', to: 'qa-api', kind: 'input' },
                { id: 'qa-c3', from: 'qa-api', to: 'qa-output', kind: 'input' }
            ];
        }
        selectedId = 'qa-api';
        selectedIds = ['qa-api'];
        if (typeof render === 'function') render();
        if (typeof syncSelectionUi === 'function') syncSelectionUi();
        if (typeof updateComposer === 'function') updateComposer();
        await new Promise(resolve => setTimeout(resolve, 450));
        const select = document.getElementById('engineSelect');
        if (select) {
            select.value = 'api';
            select.dispatchEvent(new Event('change', {bubbles:true}));
        }
        viewport.scale = .63;
        viewport.x = 118;
        viewport.y = 24;
        if (typeof applyViewport === 'function') applyViewport();
    })()`, 3600, {x:34,y:300}));
    results.push(await capture('06-plugin-generation', canvasUrl, `(async () => {
        document.querySelector('.smart-designer-rail')?.classList.add('qa-open');
        nodes = nodes.filter(node => node.id !== 'qa-plugin');
        const plugin = nodes.find(node => node.id === 'qa-api');
        const output = nodes.find(node => node.id === 'qa-output');
        if (plugin) {
            plugin.x = 620;
            plugin.y = 320;
            plugin.title = '插件生成';
        }
        if (output) {
            output.x = 1260;
            output.y = 285;
        }
        if (canvas) {
            canvas.connections = [
                { id: 'qa-c1', from: 'qa-prompt', to: 'qa-api', kind: 'input' },
                { id: 'qa-c2', from: 'qa-material', to: 'qa-api', kind: 'input' },
                { id: 'qa-c3', from: 'qa-api', to: 'qa-output', kind: 'input' }
            ];
        }
        selectedId = 'qa-api';
        selectedIds = ['qa-api'];
        if (typeof render === 'function') render();
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
        viewport.scale = .63;
        viewport.x = 118;
        viewport.y = 24;
        if (typeof applyViewport === 'function') applyViewport();
    })()`, 3600, {x:34,y:300}));
    results.push(await capture('07-results-rail', canvasUrl, `(() => {
        viewport.scale = .63;
        viewport.x = 118;
        viewport.y = 24;
        if (typeof applyViewport === 'function') applyViewport();
        document.querySelector('.smart-results-rail-btn[data-smart-results-kind="all"]')?.click();
    })()`, 3600));
} finally {
    await purgeQaCanvas(qaCanvasId);
    await purgeQaCanvases(projectFixture?.ids || []);
    if (projectFixture?.projectId) {
        await fetch(`${base}/api/projects/${encodeURIComponent(projectFixture.projectId)}`, {method:'DELETE'}).catch(() => {});
    }
}
results.push(await capture('08-plugin-center', `${base}/static/plugin-center.html`));

const canvasCaptures = results.filter(item => /^(03|04|05|06|07)-/.test(item.name));
const assertions = {
    noHorizontalOverflow: results.every(item => !item.audit.horizontalOverflow),
    noConsoleErrors: results.every(item => item.consoleErrors.length === 0),
    projectFixturesVisible: Number(results.find(item => item.name === '02-project-manager')?.audit?.projectCardCount || 0) === 8,
    canvasFixturesLoaded: canvasCaptures.every(item => Number(item.audit.appNodeCount || 0) >= 4),
    batchSelectionVisible: Number(results.find(item => item.name === '04-batch-link')?.audit?.selectedNodeCount || 0) === 3,
};
const passed = Object.values(assertions).every(Boolean);

await fs.writeFile(
    path.join(outputDir, 'visual-qa-report.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), viewport, assertions, passed, results }, null, 2),
    'utf8'
);
console.log(JSON.stringify(results.map(item => ({
    name: item.name,
    file: item.file,
    overflow: item.audit.horizontalOverflow,
    consoleErrors: item.consoleErrors
})), null, 2));
if (!passed) process.exitCode = 1;
