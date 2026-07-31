(function () {
    'use strict';

    async function openLatestSmartCanvas() {
        try {
            const response = await fetch('/api/canvases', { cache: 'no-store' });
            const payload = await response.json();
            const canvases = Array.isArray(payload) ? payload : (payload.canvases || []);
            const latest = canvases
                .filter(item => item && item.deleted !== true)
                .sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0))[0];
            if (latest?.id) {
                window.location.href = `/static/smart-canvas.html?id=${encodeURIComponent(latest.id)}`;
                return;
            }
            const created = await fetch('/api/canvases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: '未命名画布', kind: 'smart' })
            }).then(async res => {
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(body.detail || '创建画布失败');
                return body.canvas || body;
            });
            window.location.href = `/static/smart-canvas.html?id=${encodeURIComponent(created.id)}`;
        } catch (error) {
            alert(error.message || '无法进入智能画布');
        }
    }

    function navItem(page) {
        return document.querySelector(`.nav-item[onclick*="'${page}'"]`);
    }

    function installProductNavigation() {
        const canvasItem = navItem('canvas');
        if (canvasItem) {
            const text = canvasItem.querySelector('.nav-text');
            if (text) {
                text.removeAttribute('data-i18n');
                text.textContent = '项目管理';
            }
            canvasItem.setAttribute('title', '项目管理');
        }

        const assetItem = navItem('asset-manager');
        if (assetItem && !document.getElementById('smart-canvas-entry')) {
            const item = document.createElement('div');
            item.id = 'smart-canvas-entry';
            item.className = 'nav-item';
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.innerHTML = `
                <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 3v18M3 12h18"></path>
                    <path d="m7 7 10 10M17 7 7 17"></path>
                </svg>
                <span class="nav-text">智能画布</span>`;
            item.addEventListener('click', openLatestSmartCanvas);
            item.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openLatestSmartCanvas();
                }
            });
            assetItem.before(item);
        }

        const homeText = navItem('home')?.querySelector('.nav-text');
        if (homeText) homeText.textContent = '首页';
        const assetText = assetItem?.querySelector('.nav-text');
        if (assetText) {
            assetText.removeAttribute('data-i18n');
            assetText.textContent = '素材库';
        }
        const pluginText = navItem('plugin-center')?.querySelector('.nav-text');
        if (pluginText) pluginText.textContent = '插件中心';

        document.querySelectorAll('nav > div[style*="width:32px"]').forEach(divider => divider.hidden = true);
    }

    window.openLatestSmartCanvas = openLatestSmartCanvas;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installProductNavigation, { once: true });
    } else {
        installProductNavigation();
    }
})();
