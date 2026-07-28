(function(){
    const RUN_TYPES = new Set(['generator','msgen','comfy','ltxDirector','llm','video','rh']);
    const nodesHost = document.getElementById('nodes');
    const board = document.getElementById('board');
    const shell = document.getElementById('shell');
    if(!nodesHost || !board || !shell) return;

    function icon(name){
        return `<i data-lucide="${name}"></i>`;
    }

    function buildChrome(){
        const rail = document.createElement('aside');
        rail.className = 'huahai-canvas-rail editor-only';
        rail.setAttribute('aria-label','画布工具');
        rail.innerHTML = `
            <button type="button" class="active" data-hh-tool="select" title="选择">${icon('mouse-pointer-2')}<span>选择</span></button>
            <button type="button" data-hh-action="prompt" title="提示词">${icon('text-cursor-input')}<span>提示词</span></button>
            <button type="button" data-hh-action="image" title="图片">${icon('image-plus')}<span>图片</span></button>
            <button type="button" data-hh-action="generator" title="图像生成">${icon('wand-sparkles')}<span>生成</span></button>
            <button type="button" data-hh-action="output" title="输出">${icon('circle-dot')}<span>输出</span></button>
        `;
        shell.appendChild(rail);

        const inspector = document.createElement('aside');
        inspector.id = 'huahaiCanvasInspector';
        inspector.className = 'huahai-canvas-inspector';
        inspector.setAttribute('aria-live','polite');
        inspector.innerHTML = `
            <header>
                <div><small>检查器</small><strong id="huahaiInspectorTitle">未选择节点</strong></div>
                <button id="huahaiInspectorClose" type="button" title="收起检查器">${icon('x')}</button>
            </header>
            <div id="huahaiInspectorBody" class="huahai-inspector-body">
                <p>选择一个节点后，可在这里快速调整参数。</p>
            </div>
        `;
        board.appendChild(inspector);

        const toolbar = document.querySelector('.toolbar-fixed') || document.querySelector('#quickToolbar');
        const run = document.createElement('button');
        run.id = 'huahaiRunSelectedBtn';
        run.className = 'tool-btn huahai-run-selected';
        run.type = 'button';
        run.disabled = true;
        run.title = '选择一个可运行节点';
        run.innerHTML = `${icon('play')}<span>运行</span>`;
        toolbar?.appendChild(run);

        rail.querySelector('[data-hh-action="prompt"]').addEventListener('click', () => window.addPromptNode?.());
        rail.querySelector('[data-hh-action="image"]').addEventListener('click', () => window.addImageNode?.());
        rail.querySelector('[data-hh-action="generator"]').addEventListener('click', () => window.addGeneratorNode?.());
        rail.querySelector('[data-hh-action="output"]').addEventListener('click', () => window.addOutputNode?.());
        inspector.querySelector('#huahaiInspectorClose').addEventListener('click', () => inspector.classList.toggle('collapsed'));
        run.addEventListener('click', () => {
            const selected = selectedElements();
            if(selected.length !== 1) return;
            const id = selected[0].dataset.id;
            if(id) window.runNodeCascade?.(id);
        });
        window.lucide?.createIcons();
        return {inspector, run};
    }

    const chrome = buildChrome();
    if(!chrome) return;
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
    const bodyEl = document.getElementById('huahaiInspectorBody');
    let renderQueued = false;

    function selectedElements(){
        return Array.from(nodesHost.querySelectorAll('.node.selected'));
    }

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
            .filter(control => control.type !== 'file' && !control.closest('[hidden],.hidden'));
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
