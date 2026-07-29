(function(){
    const PATH_PAGE = {
        '/static/home.html': 'home',
        '/static/canvas-list.html': 'canvas-list',
        '/static/canvas.html': 'canvas',
        '/static/smart-canvas.html': 'smart-canvas',
        '/static/zimage.html': 'zimage',
        '/static/enhance.html': 'enhance',
        '/static/klein.html': 'klein',
        '/static/angle.html': 'angle',
        '/static/online.html': 'online',
        '/static/gpt-chat.html': 'gpt-chat',
        '/static/asset-manager.html': 'asset-manager',
        '/static/api-settings.html': 'api-settings',
        '/static/comfyui-settings.html': 'comfyui-settings',
        '/static/plugin-center.html': 'plugin-center'
    };
    const CANVAS_PAGES = new Set(['canvas', 'smart-canvas']);
    const AMBIENT_PAGES = new Set(['home', 'canvas-list']);
    const INTERACTIVE = [
        'button',
        'a',
        '[role="button"]',
        '.nav-item',
        '.side-pill',
        '.ws-card',
        '.node',
        '.image-node',
        '.port',
        '.node-port',
        '.canvas-asset-card',
        '.asset-card',
        '.card',
        'input[type="checkbox"]',
        'input[type="range"]',
        'select'
    ].join(',');
    const DRAG_CLASSES = [
        'huahai-interacting',
        'canvas-node-drag',
        'canvas-node-resize',
        'canvas-selecting',
        'canvas-knife',
        'smart-node-drag',
        'smart-node-resize',
        'smart-canvas-interacting'
    ];

    function pageId(){
        if(window.self === window.top && location.pathname === '/') return 'index';
        return PATH_PAGE[location.pathname] || (location.pathname.split('/').pop() || 'tool').replace(/\.html$/,'');
    }

    const currentPage = pageId();

    const PAGE_TITLES = {
        zimage: ['图像生成', '灵感生成与历史结果'],
        enhance: ['图片增强', '细节重塑与清晰度提升'],
        klein: ['极速创作', '多参考图像创意合成'],
        angle: ['镜头控制', '空间视角与构图实验'],
        online: ['在线生成', '云端任务与生成队列'],
        'gpt-chat': ['AI 对话', '创作对话与上下文'],
        'asset-manager': ['素材库', '管理项目图像与工作流'],
        'api-settings': ['API 设置', '管理模型服务与连接状态'],
        'comfyui-settings': ['工作流设置', '连接 ComfyUI 与配置节点'],
        'plugin-center': ['插件中心', '扩展花海画布的创作能力']
    };

    function installPageChrome(page){
        const title = PAGE_TITLES[page];
        if(!title || document.querySelector('.huahai-page-mast')) return;
        const mast = document.createElement('header');
        mast.className = 'huahai-page-mast';
        mast.innerHTML = `
            <div class="huahai-page-crumb">
                <span>花海画布</span><i data-lucide="chevron-right" aria-hidden="true"></i>
                <strong>${title[0]}</strong>
            </div>
            <p>${title[1]}</p>
        `;
        document.body.prepend(mast);
        if(!CANVAS_PAGES.has(page)){
            const tide = document.createElement('div');
            tide.className = 'huahai-page-tide';
            tide.setAttribute('aria-hidden','true');
            document.body.appendChild(tide);
        }
        if(page === 'gpt-chat'){
            const context = document.createElement('aside');
            context.className = 'huahai-chat-context';
            context.innerHTML = `
                <header><strong>本次对话</strong><span>上下文</span></header>
                <section><i data-lucide="waves"></i><div><strong>花海助手</strong><span>创作建议与执行步骤</span></div></section>
                <div class="huahai-context-empty">引用的图片、素材和工作流会显示在这里</div>
            `;
            document.body.appendChild(context);
        }
        if(page === 'api-settings'){
            const diagnostics = document.createElement('aside');
            diagnostics.className = 'huahai-api-diagnostics';
            diagnostics.innerHTML = `
                <header><strong>连接诊断</strong><span>实时</span></header>
                <dl>
                    <div><dt>服务端点</dt><dd>等待测试</dd></div>
                    <div><dt>认证状态</dt><dd>未验证</dd></div>
                    <div><dt>网络延迟</dt><dd>— ms</dd></div>
                </dl>
                <button type="button" data-hh-diagnostics-test><i data-lucide="activity"></i>运行连接测试</button>
            `;
            document.body.appendChild(diagnostics);
            diagnostics.querySelector('button')?.addEventListener('click', () => {
                const nativeTest = document.querySelector('[onclick*="test"], #testBtn, .test-btn');
                if(nativeTest) nativeTest.click();
                diagnostics.querySelectorAll('dd').forEach((item, index) => {
                    item.textContent = index === 2 ? '检测中…' : '正在验证';
                });
            });
        }
        if(page === 'plugin-center'){
            const detail = document.createElement('aside');
            detail.className = 'huahai-plugin-detail';
            detail.innerHTML = `
                <header><strong>插件详情</strong><span>选择一个插件</span></header>
                <div class="huahai-plugin-detail-icon"><i data-lucide="blocks"></i></div>
                <h2>扩展创作能力</h2>
                <p>点击左侧插件卡片，在这里查看版本、能力与账号配置。</p>
            `;
            document.body.appendChild(detail);
            document.addEventListener('click', event => {
                const card = event.target.closest('.card');
                if(!card) return;
                const name = card.querySelector('h2,h3,strong')?.textContent?.trim();
                if(name) detail.querySelector('h2').textContent = name;
                detail.querySelector('header span').textContent = '已选择';
            });
        }
        window.lucide?.createIcons?.();
    }

    function installSmartCanvasChrome(page){
        if(page !== 'smart-canvas' || document.querySelector('.huahai-smart-rail')) return;
        const rail = document.createElement('aside');
        rail.className = 'huahai-smart-rail';
        rail.setAttribute('aria-label', '智能画布工具');
        rail.innerHTML = `
            <button type="button" class="active" data-smart-tool="select"><i data-lucide="mouse-pointer-2"></i><span>选择</span></button>
            <button type="button" data-smart-tool="text"><i data-lucide="type"></i><span>文本</span></button>
            <button type="button" data-smart-tool="image"><i data-lucide="image"></i><span>图片</span></button>
            <button type="button" data-smart-tool="shape"><i data-lucide="shapes"></i><span>形状</span></button>
            <button type="button" data-smart-tool="connect"><i data-lucide="git-branch"></i><span>连接</span></button>
            <button type="button" data-smart-tool="upload"><i data-lucide="upload"></i><span>上传</span></button>
        `;
        const inspector = document.createElement('aside');
        inspector.className = 'huahai-smart-inspector';
        inspector.innerHTML = `
            <header><strong>智能建议</strong><span>布局</span></header>
            <section>
                <div class="huahai-smart-layout-grid">
                    <button type="button" aria-label="焦点布局"><i data-lucide="panel-top"></i></button>
                    <button type="button" aria-label="双栏布局"><i data-lucide="columns-2"></i></button>
                    <button type="button" aria-label="画廊布局"><i data-lucide="gallery-horizontal"></i></button>
                    <button type="button" aria-label="故事板布局"><i data-lucide="layout-grid"></i></button>
                </div>
            </section>
            <section><strong>自动整理</strong><p>根据内容关系调整节点层级与间距。</p><button type="button" data-smart-arrange><i data-lucide="sparkles"></i>应用建议</button></section>
        `;
        document.body.append(rail, inspector);
        rail.addEventListener('click', event => {
            const button = event.target.closest('[data-smart-tool]');
            if(!button) return;
            rail.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
            const tool = button.dataset.smartTool;
            if(tool === 'upload') document.getElementById('fileInput')?.click();
            if(tool === 'text') document.getElementById('promptInput')?.focus();
        });
        inspector.querySelector('[data-smart-arrange]')?.addEventListener('click', () => {
            document.querySelector('.minimap-arrange-btn,[data-action="arrange"],[title*="整理"]')?.click();
        });
        window.lucide?.createIcons?.();
    }

    function dragging(){
        return DRAG_CLASSES.some(name => document.body.classList.contains(name))
            || !!document.querySelector('.panning,.dragging,.resizing,.port-dragging,.connection-erasing');
    }

    function canvasBlank(target, page){
        if(!CANVAS_PAGES.has(page)) return false;
        return !!target.closest?.('#board,#world,#shell')
            && !target.closest?.(INTERACTIVE)
            && !target.closest?.('input,textarea,select,[contenteditable="true"]');
    }

    function init(){
        const body = document.body;
        if(!body || body.dataset.huahaReady === '1') return;
        body.dataset.huahaReady = '1';
        const page = currentPage;
        body.dataset.huahaPage = page;
        body.dataset.huahaSurface = CANVAS_PAGES.has(page) ? 'canvas' : (AMBIENT_PAGES.has(page) ? 'ambient' : (page === 'index' ? 'shell' : 'tool'));
        installPageChrome(page);
        installSmartCanvasChrome(page);

        const light = document.createElement('div');
        light.className = 'huahai-cursor-light';
        light.setAttribute('aria-hidden','true');
        body.appendChild(light);

        let frame = 0;
        let point = {x:-200,y:-200};
        let pointerDown = null;
        let hovered = null;

        function renderPointer(){
            frame = 0;
            const size = parseFloat(getComputedStyle(light).width) || 140;
            light.style.transform = `translate3d(${point.x - size / 2}px, ${point.y - size / 2}px, 0)`;
        }

        function schedulePointer(event){
            point = {x:event.clientX,y:event.clientY};
            if(!frame) frame = requestAnimationFrame(renderPointer);
        }

        function clearHover(){
            if(hovered) hovered.classList.remove('huahai-hovered');
            hovered = null;
        }

        window.addEventListener('pointermove', event => {
            schedulePointer(event);
            body.classList.toggle('huahai-pointer-visible', event.pointerType !== 'touch' && !dragging());
            if(pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 4) {
                pointerDown.moved = true;
                body.classList.add('huahai-interacting');
            }
            const next = event.target.closest?.(INTERACTIVE) || null;
            if(next !== hovered){
                clearHover();
                hovered = next;
                hovered?.classList.add('huahai-hovered');
            }
        }, {passive:true});

        window.addEventListener('pointerleave', () => {
            body.classList.remove('huahai-pointer-visible');
            clearHover();
        }, {passive:true});

        window.addEventListener('pointerdown', event => {
            if(event.button !== 0) return;
            pointerDown = {x:event.clientX,y:event.clientY,moved:false};
        }, {passive:true});

        window.addEventListener('pointerup', () => {
            requestAnimationFrame(() => body.classList.remove('huahai-interacting'));
        }, {passive:true});

        window.addEventListener('click', event => {
            const state = pointerDown;
            pointerDown = null;
            if(event.button !== 0 || state?.moved || dragging() || canvasBlank(event.target, page)) return;
            const target = event.target.closest?.(INTERACTIVE);
            if(!target) return;
            const count = page === 'canvas-list' && target.closest('.ws-card') ? 3 : 2;
            for(let i=0;i<count;i++){
                const ripple = document.createElement('span');
                ripple.className = `huahai-ripple${i === 1 ? ' is-second' : ''}${i === 2 ? ' is-third' : ''}`;
                ripple.style.left = `${event.clientX}px`;
                ripple.style.top = `${event.clientY}px`;
                ripple.setAttribute('aria-hidden','true');
                body.appendChild(ripple);
                ripple.addEventListener('animationend', () => ripple.remove(), {once:true});
                setTimeout(() => ripple.remove(), 900);
            }
        }, true);
    }

    document.addEventListener('DOMContentLoaded', () => {
        if(currentPage === 'smart-canvas'){
            const initialPrompt = sessionStorage.getItem('huahai_initial_prompt');
            const promptInput = document.getElementById('promptInput');
            if(initialPrompt && promptInput){
                sessionStorage.removeItem('huahai_initial_prompt');
                if(promptInput.matches('[contenteditable="true"]')) promptInput.textContent = initialPrompt;
                else promptInput.value = initialPrompt;
                promptInput.dispatchEvent(new Event('input', {bubbles:true}));
            }
        }
    }, {once:true});

    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
    else init();
})();
