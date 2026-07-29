(function(){
    const RUN_TYPES = new Set(['generator','msgen','comfy','ltxDirector','llm','video','rh']);
    const nodesHost = document.getElementById('nodes');
    const board = document.getElementById('board');
    const shell = document.getElementById('shell');
    if(!nodesHost || !board || !shell) return;

    function notifyCreationMode(active){
        try {
            window.parent?.postMessage({
                type:'studio-canvas-creation-mode',
                active:Boolean(active)
            }, location.origin);
        } catch(e) {}
    }
    notifyCreationMode(true);
    window.addEventListener('pagehide', () => notifyCreationMode(false), {once:true});

    function icon(name){
        return `<i data-lucide="${name}"></i>`;
    }

    function selectedElements(){
        return Array.from(nodesHost.querySelectorAll('.node.selected'));
    }

    function buildChrome(){
        const rail = document.createElement('aside');
        rail.className = 'huahai-canvas-rail editor-only';
        rail.setAttribute('aria-label','画布工具');
        rail.innerHTML = `
            <button type="button" class="active" data-hh-tool="select" title="选择">${icon('mouse-pointer-2')}<span>选择</span></button>
            <button type="button" data-hh-action="prompt" title="新建提示词节点">${icon('text-cursor-input')}<span>提示词</span></button>
            <button type="button" data-hh-action="image" title="新建图片节点">${icon('image-plus')}<span>图片</span></button>
            <button type="button" data-hh-action="generator" title="新建图像生成节点">${icon('wand-sparkles')}<span>生成</span></button>
            <button type="button" data-hh-action="output" title="新建输出节点">${icon('circle-dot')}<span>输出</span></button>
        `;
        shell.appendChild(rail);

        const inspector = document.createElement('aside');
        inspector.id = 'huahaiCanvasInspector';
        inspector.className = 'huahai-canvas-inspector';
        inspector.setAttribute('aria-live','polite');
        inspector.innerHTML = `
            <header>
                <strong>检查器</strong>
                <button id="huahaiInspectorClose" type="button" title="收起检查器">${icon('x')}</button>
            </header>
            <div class="huahai-inspector-body">
                <section class="huahai-inspector-node">
                    <span>节点</span>
                    <div><strong id="huahaiInspectorTitle">未选择节点</strong>${icon('copy')}</div>
                </section>
                <div id="huahaiInspectorFields" class="huahai-inspector-fields">
                    <p>选择一个节点后，可在这里快速调整参数。</p>
                </div>
            </div>
        `;
        board.appendChild(inspector);

        const zoom = document.createElement('div');
        zoom.id = 'huahaiCanvasZoom';
        zoom.className = 'huahai-canvas-zoom editor-only';
        zoom.setAttribute('aria-label','画布缩放控制');
        zoom.innerHTML = `
            <button type="button" data-hh-zoom-out title="缩小画布">${icon('minus')}</button>
            <button id="huahaiCanvasZoomPercent" class="canvas-zoom-percent" type="button" title="Ctrl + 滚轮缩放画布，点击重置为 100%">100%</button>
            <button type="button" data-hh-zoom-in title="放大画布">${icon('plus')}</button>
            <button type="button" data-hh-zoom-fit title="适应全部节点">${icon('maximize')}</button>
        `;
        board.appendChild(zoom);

        const history = document.createElement('div');
        history.className = 'huahai-canvas-history editor-only';
        history.innerHTML = `
            <button type="button" data-hh-history="undo">${icon('undo-2')}<span>撤销</span></button>
            <button type="button" data-hh-history="redo" disabled>${icon('redo-2')}<span>重做</span></button>
            <button type="button" data-hh-history="delete" class="danger">${icon('trash-2')}<span>删除</span></button>
        `;
        board.appendChild(history);

        const nodeMenu = document.createElement('div');
        nodeMenu.className = 'huahai-node-menu';
        nodeMenu.hidden = true;
        nodeMenu.innerHTML = `
            <button type="button" data-hh-node-action="duplicate">${icon('copy')}<span>复制节点</span></button>
            <button type="button" data-hh-node-action="delete" class="danger">${icon('trash-2')}<span>删除节点</span></button>
        `;
        board.appendChild(nodeMenu);
        let menuNodeId = '';

        const toolbar = document.querySelector('.toolbar-fixed') || document.querySelector('#quickToolbar');
        const topUndo = document.createElement('button');
        topUndo.className = 'tool-btn huahai-top-history';
        topUndo.type = 'button';
        topUndo.title = '撤销';
        topUndo.innerHTML = icon('undo-2');
        const topRedo = document.createElement('button');
        topRedo.className = 'tool-btn huahai-top-history';
        topRedo.type = 'button';
        topRedo.disabled = true;
        topRedo.title = '重做';
        topRedo.innerHTML = icon('redo-2');
        const run = document.createElement('button');
        run.id = 'huahaiRunSelectedBtn';
        run.className = 'tool-btn huahai-run-selected';
        run.type = 'button';
        run.disabled = true;
        run.title = '选择一个可运行节点';
        run.innerHTML = `<span>运行</span>${icon('play')}`;
        if(toolbar){
            const divider = document.createElement('span');
            divider.className = 'huahai-toolbar-divider';
            toolbar.append(divider, topUndo, topRedo, run);
        }

        rail.querySelector('[data-hh-action="prompt"]').addEventListener('click', () => window.addPromptNode?.());
        rail.querySelector('[data-hh-action="image"]').addEventListener('click', () => window.addImageNode?.());
        rail.querySelector('[data-hh-action="generator"]').addEventListener('click', () => window.addGeneratorNode?.());
        rail.querySelector('[data-hh-action="output"]').addEventListener('click', () => window.addOutputNode?.());
        board.addEventListener('click', event => {
            const more = event.target.closest('.huahai-node-more');
            if(more){
                event.preventDefault();
                event.stopImmediatePropagation();
                menuNodeId = more.dataset.nodeId || '';
                window.huahaiCanvasSelectOnly?.(menuNodeId);
                const rect = board.getBoundingClientRect();
                nodeMenu.style.left = `${Math.min(rect.width - 150, Math.max(8, event.clientX - rect.left - 8))}px`;
                nodeMenu.style.top = `${Math.min(rect.height - 88, Math.max(8, event.clientY - rect.top + 8))}px`;
                nodeMenu.hidden = false;
                window.lucide?.createIcons();
                return;
            }
        }, true);
        nodeMenu.querySelector('[data-hh-node-action="duplicate"]').addEventListener('click', event => {
            event.stopPropagation();
            window.huahaiCanvasSelectOnly?.(menuNodeId);
            window.huahaiCanvasDuplicateSelected?.();
            nodeMenu.hidden = true;
        });
        nodeMenu.querySelector('[data-hh-node-action="delete"]').addEventListener('click', event => {
            event.stopPropagation();
            window.huahaiCanvasSelectOnly?.(menuNodeId);
            window.deleteSelectedNodes?.();
            nodeMenu.hidden = true;
        });
        document.addEventListener('pointerdown', event => {
            if(nodeMenu.hidden || event.target.closest('.huahai-node-menu,.huahai-node-more')) return;
            nodeMenu.hidden = true;
        }, true);

        inspector.querySelector('#huahaiInspectorClose').addEventListener('click', () => inspector.classList.toggle('collapsed'));
        zoom.querySelector('[data-hh-zoom-out]').addEventListener('click', () => window.huahaiCanvasZoomBy?.(-.1));
        zoom.querySelector('[data-hh-zoom-in]').addEventListener('click', () => window.huahaiCanvasZoomBy?.(.1));
        zoom.querySelector('[data-hh-zoom-fit]').addEventListener('click', () => window.huahaiCanvasFitAll?.());
        zoom.querySelector('#huahaiCanvasZoomPercent').addEventListener('click', () => window.huahaiCanvasResetZoom?.());
        history.querySelector('[data-hh-history="undo"]').addEventListener('click', () => window.performUndo?.());
        history.querySelector('[data-hh-history="delete"]').addEventListener('click', () => window.deleteSelectedNodes?.());
        topUndo.addEventListener('click', () => window.performUndo?.());
        run.addEventListener('click', () => {
            const selected = selectedElements();
            if(selected.length !== 1) return;
            const id = selected[0].dataset.id;
            if(id) window.runNodeCascade?.(id);
        });

        const refreshZoom = event => {
            const percent = Number(event?.detail?.percent ?? window.huahaiCanvasZoomPercent?.() ?? 100);
            const label = zoom.querySelector('#huahaiCanvasZoomPercent');
            if(label) label.textContent = `${Math.round(percent)}%`;
        };
        window.addEventListener('canvas-viewport-change', refreshZoom);
        requestAnimationFrame(refreshZoom);
        window.lucide?.createIcons();
        return {inspector, run, zoom, history, nodeMenu};
    }

    const chrome = buildChrome();
    if(!chrome) return;
    const brand = document.querySelector('.miora-canvas-brand');
    const backButton = document.getElementById('backToManagerBtn');
    if(brand && backButton){
        brand.tabIndex = 0;
        brand.setAttribute('role','button');
        brand.setAttribute('aria-label','返回项目管理');
        brand.title = '返回项目管理';
        brand.addEventListener('click', () => backButton.click());
        brand.addEventListener('keydown', event => {
            if(event.key === 'Enter' || event.key === ' '){
                event.preventDefault();
                backButton.click();
            }
        });
    }

    const initialPrompt = sessionStorage.getItem('huahai_initial_prompt');
    if(initialPrompt && typeof window.addPromptNode === 'function'){
        sessionStorage.removeItem('huahai_initial_prompt');
        window.addPromptNode();
        requestAnimationFrame(() => {
            const promptNodes = Array.from(nodesHost.querySelectorAll('.prompt-node'));
            const node = promptNodes[promptNodes.length - 1];
            const input = node?.querySelector('textarea, [contenteditable="true"], input[type="text"]');
            if(!input) return;
            if(input.matches('[contenteditable="true"]')) input.textContent = initialPrompt;
            else input.value = initialPrompt;
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.focus();
        });
    }

    const titleEl = document.getElementById('huahaiInspectorTitle');
    const bodyEl = document.getElementById('huahaiInspectorFields');
    let renderQueued = false;

    function labelFor(control, index){
        const explicit = control.closest('label')?.querySelector('span,strong')?.textContent?.trim();
        return explicit || control.getAttribute('aria-label') || control.getAttribute('placeholder') || control.name || `参数 ${index + 1}`;
    }

    function cloneControl(original, index){
        const row = document.createElement('label');
        row.className = 'huahai-inspector-field';
        const name = document.createElement('span');
        name.textContent = labelFor(original, index);
        let proxy;
        if(original.tagName === 'SELECT'){
            proxy = document.createElement('select');
            proxy.innerHTML = original.innerHTML;
            proxy.value = original.value;
        } else if(original.tagName === 'TEXTAREA'){
            proxy = document.createElement('textarea');
            proxy.rows = Math.min(5, Math.max(2, original.rows || 3));
            proxy.value = original.value;
        } else {
            proxy = document.createElement('input');
            proxy.type = original.type || 'text';
            if(proxy.type === 'checkbox') proxy.checked = original.checked;
            else proxy.value = original.value;
            ['min','max','step','placeholder'].forEach(attr => {
                if(original.hasAttribute(attr)) proxy.setAttribute(attr, original.getAttribute(attr));
            });
        }
        proxy.disabled = original.disabled;
        const sync = () => {
            if(proxy.type === 'checkbox') original.checked = proxy.checked;
            else original.value = proxy.value;
            original.dispatchEvent(new Event('input', {bubbles:true}));
            original.dispatchEvent(new Event('change', {bubbles:true}));
        };
        proxy.addEventListener('input', sync);
        proxy.addEventListener('change', sync);
        row.append(name, proxy);
        return row;
    }

    function render(){
        renderQueued = false;
        const selected = selectedElements();
        chrome.history.querySelector('[data-hh-history="delete"]').disabled = !selected.length;
        if(selected.length !== 1){
            titleEl.textContent = selected.length ? `已选择 ${selected.length} 个节点` : '未选择节点';
            bodyEl.innerHTML = `<p>${selected.length ? '多选状态下可拖动、分组或复制节点。' : '选择一个节点后，可在这里快速调整参数。'}</p>`;
            chrome.run.disabled = true;
            chrome.run.title = selected.length ? '请只选择一个可运行节点' : '选择一个可运行节点';
            return;
        }
        const node = selected[0];
        const nodeTitle = node.querySelector('.node-title')?.textContent?.trim() || '节点';
        const type = node.className.match(/\b([A-Za-z]+)-node\b/)?.[1] || '';
        titleEl.textContent = nodeTitle;
        bodyEl.innerHTML = '';
        const controls = Array.from(node.querySelectorAll('input,select,textarea'))
            .filter(control =>
                control.type !== 'file' &&
                !control.closest('[hidden],.hidden') &&
                control.getClientRects().length > 0
            );
        controls.slice(0,12).forEach((control,index) => bodyEl.appendChild(cloneControl(control,index)));
        if(!controls.length) bodyEl.innerHTML = '<p>该节点没有可快速调整的参数。</p>';
        chrome.run.disabled = !RUN_TYPES.has(type);
        chrome.run.title = RUN_TYPES.has(type) ? `运行 ${nodeTitle} 及其上游流程` : '当前节点不可运行';
        window.lucide?.createIcons();
    }

    function scheduleRender(){
        if(renderQueued) return;
        renderQueued = true;
        requestAnimationFrame(render);
    }

    const observer = new MutationObserver(scheduleRender);
    observer.observe(nodesHost, {subtree:true,childList:true,attributes:true,attributeFilter:['class','value','disabled']});
    board.addEventListener('click', scheduleRender, true);
    board.addEventListener('change', scheduleRender, true);
    scheduleRender();
})();
