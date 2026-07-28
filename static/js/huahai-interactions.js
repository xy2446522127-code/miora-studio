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
        const page = pageId();
        body.dataset.huahaPage = page;
        body.dataset.huahaSurface = CANVAS_PAGES.has(page) ? 'canvas' : (AMBIENT_PAGES.has(page) ? 'ambient' : (page === 'index' ? 'shell' : 'tool'));

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
        if(page === 'smart-canvas'){
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
