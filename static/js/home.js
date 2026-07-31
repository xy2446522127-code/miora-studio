(function(){
    const stateEl = document.getElementById('serviceState');
    const versionEl = document.getElementById('versionState');
    const recentEl = document.getElementById('recentCanvases');
    const promptEl = document.getElementById('homePrompt');
    const promptCountEl = document.getElementById('homePromptCount');
    const startBtn = document.getElementById('startCreateBtn');
    const continueBtn = document.getElementById('continueCanvasBtn');
    const projectsBtn = document.getElementById('openProjectsBtn');
    const lastCanvasButton = document.getElementById('lastCanvasButton');
    const lastCanvasTitle = document.getElementById('lastCanvasTitle');
    const lastCanvasTime = document.getElementById('lastCanvasTime');
    let recentItems = [];

    function escapeHtml(value){
        return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[char]));
    }

    function formatTime(value){
        const number = Number(value || 0);
        if(!number) return '刚刚';
        const time = number < 10000000000 ? number * 1000 : number;
        const date = new Date(time);
        if(Number.isNaN(date.getTime())) return '最近更新';
        return date.toLocaleString('zh-CN', {
            month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit',
            hour12:false
        });
    }

    function switchParentPage(id){
        try {
            const doc = window.parent.document;
            const el = doc.querySelector(`[onclick*="'${id}'"]`);
            if(typeof window.parent.switchUI === 'function' && el){
                window.parent.switchUI(el, id);
                return true;
            }
        } catch(e) {}
        return false;
    }

    function openCanvas(canvas){
        if(!canvas?.id) return;
        const id = encodeURIComponent(canvas.id);
        const project = encodeURIComponent(canvas.project || 'default');
        window.location.href = `/static/smart-canvas.html?id=${id}&project=${project}`;
    }

    async function loadService(){
        try {
            const response = await fetch('/api/app-info', {cache:'no-store'});
            if(!response.ok) throw new Error('offline');
            const info = await response.json();
            stateEl.classList.remove('is-offline');
            stateEl.querySelector('b').textContent = '服务在线';
            versionEl.textContent = `v${info.version || '—'}`;
        } catch(error){
            stateEl.classList.add('is-offline');
            stateEl.querySelector('b').textContent = '服务暂不可用';
            versionEl.textContent = 'v—';
        }
    }

    function recentCard(item){
        return `
            <button class="hh-recent-card" type="button" data-canvas-id="${escapeHtml(item.id)}">
                <img src="/static/images/huahai-home-preview.png" alt="">
                <span class="hh-recent-meta">
                    <b>${escapeHtml(item.title || '未命名画布')}</b>
                    <small>${escapeHtml(formatTime(item.updated_at || item.created_at))}</small>
                </span>
                <i data-lucide="more-vertical" aria-hidden="true"></i>
            </button>
        `;
    }

    async function loadRecent(){
        try {
            const response = await fetch('/api/canvases', {cache:'no-store'});
            if(!response.ok) throw new Error('load failed');
            const data = await response.json();
            recentItems = (data.canvases || [])
                .slice()
                .sort((a,b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0));
            const latest = recentItems[0];
            if(latest){
                lastCanvasButton.disabled = false;
                lastCanvasTitle.textContent = latest.title || '未命名画布';
                lastCanvasTime.textContent = formatTime(latest.updated_at || latest.created_at);
                continueBtn.disabled = false;
            } else {
                continueBtn.disabled = true;
            }

            const items = recentItems.slice(0,4);
            if(!items.length){
                recentEl.innerHTML = '<div class="hh-home-empty">还没有画布，从上方创建第一块吧。</div>';
                return;
            }
            recentEl.innerHTML = items.map(recentCard).join('');
            recentEl.querySelectorAll('[data-canvas-id]').forEach(button => {
                const item = items.find(entry => String(entry.id) === button.dataset.canvasId);
                if(item) button.addEventListener('click', () => openCanvas(item));
            });
            if(window.lucide) lucide.createIcons();
        } catch(error){
            recentEl.innerHTML = '<div class="hh-home-empty">最近画布读取失败，请稍后重试。</div>';
        }
    }

    async function createCanvas(){
        startBtn.disabled = true;
        try {
            const prompt = promptEl.value.trim();
            const title = prompt ? prompt.slice(0,24) : '未命名画布';
            const response = await fetch('/api/canvases', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    title,
                    icon:'layers',
                    kind:'smart',
                    project:'default'
                })
            });
            const data = await response.json().catch(() => ({}));
            if(!response.ok || !data.canvas) throw new Error(data.detail || '创建失败');
            if(prompt){
                try { sessionStorage.setItem('huahai_initial_prompt', prompt); } catch(e) {}
            }
            openCanvas(data.canvas);
        } catch(error){
            alert(error.message || '创建画布失败');
            startBtn.disabled = false;
        }
    }

    promptEl.addEventListener('input', () => {
        promptCountEl.textContent = `${promptEl.value.length} / 1000`;
    });
    promptEl.addEventListener('keydown', event => {
        if((event.ctrlKey || event.metaKey) && event.key === 'Enter') createCanvas();
    });
    projectsBtn.addEventListener('click', () => {
        if(!switchParentPage('canvas')) window.location.href = '/static/canvas-list.html';
    });
    startBtn.addEventListener('click', createCanvas);
    continueBtn.addEventListener('click', () => openCanvas(recentItems[0]));
    lastCanvasButton.addEventListener('click', () => openCanvas(recentItems[0]));

    loadService();
    loadRecent();
    if(window.lucide) lucide.createIcons();
})();
