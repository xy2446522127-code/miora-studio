import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.HUAHAI_QA_BASE || 'http://127.0.0.1:3000';
const port = Number(process.env.HUAHAI_CDP_PORT || 9333);
const output = path.resolve(process.env.HUAHAI_INTERACTION_QA_OUTPUT || 'docs/screenshots/2026.08.01.1/interaction-qa.json');
const viewportWidth = Number(process.env.HUAHAI_QA_WIDTH || 1440);
const viewportHeight = Number(process.env.HUAHAI_QA_HEIGHT || 900);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function createCanvas() {
    const created = await fetch(`${base}/api/canvases`, {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({title:'花海交互回归', kind:'smart', project:'default'})
    }).then(response => response.json());
    const id = String((created.canvas || created).id || '');
    if(!id) throw new Error('Unable to create interaction QA canvas');
    const image = {url:'/static/images/huahai-home-preview.png', name:'海面参考.png', mediaKind:'image', natural_w:1536, natural_h:1024};
    const nodes = [
        {id:'qa-prompt', type:'smart-prompt', x:120, y:220, w:300, h:210, title:'提示词', text:'蓝色花海，海风，灯塔，电影光影。', images:[]},
        {id:'qa-image', type:'smart-image', x:120, y:500, title:'参考图', images:[image], scale:1},
        {id:'qa-api', type:'smart-image', x:640, y:340, title:'API 生成', images:[], scale:1, runSettings:{engine:'api', apiKind:'image', provider_id:'custom-api', model:'gpt-image-2', ratio:'wide', resolution:'1k', quality:'high', count:1}},
        {id:'qa-output', type:'smart-image', x:1120, y:340, title:'输出', images:[image], scale:1}
    ];
    const connections = [
        {id:'qa-c1', from:'qa-prompt', to:'qa-api', kind:'input'},
        {id:'qa-c2', from:'qa-image', to:'qa-api', kind:'input'},
        {id:'qa-c3', from:'qa-api', to:'qa-output', kind:'input'}
    ];
    const saved = await fetch(`${base}/api/canvases/${encodeURIComponent(id)}`, {
        method:'PUT',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({title:'花海交互回归', nodes, connections, viewport:{x:150,y:40,scale:.82}, settings:{engine:'api',apiKind:'image'}, client_id:'interaction-qa', base_updated_at:0})
    });
    if(!saved.ok) throw new Error(`Unable to save interaction QA canvas: ${saved.status}`);
    return id;
}

async function purgeCanvas(id) {
    if(!id) return;
    await fetch(`${base}/api/canvases/${encodeURIComponent(id)}`, {method:'DELETE'}).catch(() => {});
    await fetch(`${base}/api/canvases/${encodeURIComponent(id)}/purge`, {method:'DELETE'}).catch(() => {});
}

async function openPage(url) {
    const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {method:'PUT'}).then(response => response.json());
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, {once:true});
        socket.addEventListener('error', reject, {once:true});
    });
    let id = 0;
    const pending = new Map();
    const errors = [];
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if(message.id && pending.has(message.id)){
            const handler = pending.get(message.id);
            pending.delete(message.id);
            if(message.error) handler.reject(new Error(message.error.message));
            else handler.resolve(message.result || {});
        }
        if(message.method === 'Runtime.exceptionThrown') errors.push(message.params?.exceptionDetails?.text || 'Runtime exception');
        if(message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') errors.push(message.params.entry.text);
    });
    const send = (method, params={}) => new Promise((resolve, reject) => {
        const requestId = ++id;
        pending.set(requestId, {resolve, reject});
        socket.send(JSON.stringify({id:requestId, method, params}));
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', {cacheDisabled:true});
    await send('Emulation.setDeviceMetricsOverride', {
        width: viewportWidth,
        height: viewportHeight,
        deviceScaleFactor: 1,
        mobile: viewportWidth < 720
    });
    await send('Page.navigate', {url});
    await wait(3800);
    return {socket, send, errors};
}

async function evaluate(cdp, expression) {
    const result = await cdp.send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
    return result.result?.value;
}

const canvasId = await createCanvas();
let cdp;
try {
    cdp = await openPage(`${base}/static/smart-canvas.html?id=${encodeURIComponent(canvasId)}`);
    const initial = await evaluate(cdp, `(async () => {
        const node = document.querySelector('.image-node[data-id="qa-api"]');
        node?.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:720, clientY:420}));
        await new Promise(resolve => setTimeout(resolve, 500));
        const rail = document.querySelector('.smart-designer-rail');
        const refs = document.querySelectorAll('#inputThumbsRow .input-thumb').length;
        return {
            composerOpen: document.getElementById('composer')?.classList.contains('open'),
            composerInShell: document.getElementById('composer')?.parentElement?.id === 'shell',
            engine: document.getElementById('engineSelect')?.value,
            apiTabActive: document.querySelector('[data-engine-mode="api"]')?.classList.contains('active'),
            references: refs,
            zoom: document.getElementById('smartCanvasZoomPercent')?.textContent,
            railOpacity: Number(getComputedStyle(rail).opacity),
            normalFlow: document.querySelectorAll('.conn-flow').length,
            highlightedFlow: document.querySelectorAll('.conn-flow-selected').length
        };
    })()`);

    const tabSwitch = await evaluate(cdp, `(async () => {
        document.querySelector('[data-engine-mode="plugin"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 220));
        const plugin = {
            engine: document.getElementById('engineSelect')?.value,
            active: document.querySelector('[data-engine-mode="plugin"]')?.classList.contains('active'),
            options: document.querySelectorAll('#dynamicParams .provider-control .direct-option').length,
            ripple: document.querySelectorAll('.huahai-ripple').length
        };
        document.querySelector('[data-engine-mode="api"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 220));
        document.querySelector('#apiKindToggle [data-kind="video"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 220));
        const video = document.getElementById('composer')?.dataset.kind;
        document.querySelector('#apiKindToggle [data-kind="image"]')?.click();
        return {...plugin, videoKind:video, restoredKind:document.getElementById('composer')?.dataset.kind};
    })()`);

    const responsiveComposer = await evaluate(cdp, `(() => {
        const panel = document.getElementById('composer');
        if(!panel) return {exists:false};
        panel.scrollTop = panel.scrollHeight;
        const panelRect = panel.getBoundingClientRect();
        const runRect = document.getElementById('runBtn')?.getBoundingClientRect();
        return {
            exists:true,
            panelTop:panelRect.top,
            panelBottom:panelRect.bottom,
            viewportBottom:innerHeight,
            scrollable:panel.scrollHeight > panel.clientHeight,
            runVisible:Boolean(runRect && runRect.top >= panelRect.top - 1 && runRect.bottom <= panelRect.bottom + 1)
        };
    })()`);

    const beforeZoom = await evaluate(cdp, `viewport.scale`);
    const canvasWheelPoint = {
        x: Math.max(260, viewportWidth - 190),
        y: Math.max(180, Math.min(viewportHeight - 180, 560))
    };
    await cdp.send('Input.dispatchMouseEvent', {type:'mouseWheel', ...canvasWheelPoint, deltaY:-240, deltaX:0, modifiers:2});
    await wait(260);
    const canvasZoom = await evaluate(cdp, `({scale:viewport.scale,label:document.getElementById('smartCanvasZoomPercent')?.textContent})`);
    const composerRect = await evaluate(cdp, `(() => { const r=document.getElementById('composer').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
    await cdp.send('Input.dispatchMouseEvent', {type:'mouseWheel', x:composerRect.x, y:composerRect.y, deltaY:-240, deltaX:0, modifiers:2});
    await wait(260);
    const composerWheelScale = await evaluate(cdp, `viewport.scale`);

    const batch = await evaluate(cdp, `(() => {
        selectedId='qa-prompt';
        selectedIds=['qa-prompt','qa-image'];
        syncSelectionUi();
        return {
            hubOpen:document.getElementById('smartSelectionHub')?.classList.contains('open'),
            count:document.querySelector('.smart-batch-selection-count')?.textContent,
            proxy:Boolean(document.querySelector('.smart-batch-proxy-port'))
        };
    })()`);

    await cdp.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    const reducedMotion = await evaluate(cdp, `(() => {
        document.querySelector('[data-engine-mode="plugin"]')?.click();
        return {
            media:matchMedia('(prefers-reduced-motion: reduce)').matches,
            ripple:document.querySelectorAll('.huahai-ripple').length,
            flowAnimation:getComputedStyle(document.querySelector('.conn-flow')).animationName
        };
    })()`);

    const report = {
        generatedAt:new Date().toISOString(),
        viewport:`${viewportWidth}x${viewportHeight}`,
        browser:'visible Chrome via CDP',
        initial,
        tabSwitch,
        zoom:{before:beforeZoom, after:canvasZoom, composerWheelScale},
        responsiveComposer,
        batch,
        reducedMotion,
        consoleErrors:cdp.errors,
        assertions:{
            composerUsable:Boolean(initial.composerOpen && initial.composerInShell),
            referencesVisible:initial.references >= 1,
            dynamicPlugins:tabSwitch.options >= 2 && tabSwitch.engine === 'plugin' && tabSwitch.active,
            mediaKinds:tabSwitch.videoKind === 'video' && tabSwitch.restoredKind === 'image',
            explicitZoom:Boolean(canvasZoom.scale !== beforeZoom && /%$/.test(canvasZoom.label || '')),
            composerWheelIsolated:composerWheelScale === canvasZoom.scale,
            responsiveComposer:Boolean(
                responsiveComposer.exists
                && (viewportHeight > 800 || (responsiveComposer.panelBottom <= viewportHeight + 1 && responsiveComposer.runVisible))
            ),
            batchInterface:Boolean(batch.hubOpen && batch.proxy),
            connectionStates:initial.normalFlow >= 3 && initial.highlightedFlow >= 1,
            reducedMotion:Boolean(reducedMotion.media && reducedMotion.ripple === 0 && reducedMotion.flowAnimation === 'none'),
            noConsoleErrors:cdp.errors.length === 0
        }
    };
    report.passed = Object.values(report.assertions).every(Boolean);
    await fs.mkdir(path.dirname(output), {recursive:true});
    await fs.writeFile(output, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
} finally {
    if(cdp){
        await cdp.send('Page.close').catch(() => {});
        cdp.socket.close();
    }
    await purgeCanvas(canvasId);
}
