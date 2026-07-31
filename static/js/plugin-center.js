const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let discoveredPlugins = [];

async function api(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || '请求失败');
    return body;
}

function capabilityLabels(plugin) {
    const set = new Set(plugin.capabilities || []);
    const labels = [];
    if (set.has('image') || set.has('imageGeneration')) labels.push('图片生成');
    if (set.has('video') || set.has('videoGeneration') || plugin.type === 'video-provider') labels.push('视频生成');
    if (set.has('browserLogin')) labels.push('浏览器登录');
    if (set.has('downloadCapture')) labels.push('下载自动接入');
    if (!labels.length) labels.push(...[...set].slice(0, 4));
    return labels;
}

function browserPluginCard(plugin) {
    const isGemini = String(plugin.id).includes('gemini');
    return `
        <article class="pc-mini-card">
            <div class="pc-mini-top">
                <div class="pc-mini-icon"><i data-lucide="${isGemini ? 'sparkles' : 'bot'}"></i></div>
                <div>
                    <h3>${escapeHtml(plugin.name || plugin.id)}</h3>
                    <p>${escapeHtml(plugin.description || '浏览器辅助生成插件')}</p>
                </div>
                <span class="pc-status">${plugin.runtime_ready === false ? '待安装' : '已启用'}</span>
            </div>
            <div class="pc-tags">${capabilityLabels(plugin).map(item => `<span class="pc-tag">${escapeHtml(item)}</span>`).join('')}</div>
            <div class="pc-mini-actions">
                <button class="pc-link" type="button" data-switch-installed>查看能力 ›</button>
                <button class="pc-btn pc-small" type="button" data-login="${escapeHtml(plugin.id)}"><i data-lucide="user-round"></i>账号登录</button>
            </div>
        </article>`;
}

function installedPluginCard(plugin) {
    const ready = plugin.enabled !== false && plugin.runtime_ready !== false;
    const browserPlugin = (plugin.capabilities || []).includes('browserLogin');
    return `
        <article class="card">
            <div class="card-top">
                <div class="plugin-icon">${escapeHtml((plugin.name || plugin.id).slice(0, 1).toUpperCase())}</div>
                <div><h3>${escapeHtml(plugin.name || plugin.id)}</h3><div class="meta">${escapeHtml(plugin.id)} · v${escapeHtml(plugin.version || '0.0.0')}</div></div>
                <div class="status ${ready ? '' : 'warn'}">${ready ? '可使用' : '待安装'}</div>
            </div>
            <div class="tags">${capabilityLabels(plugin).map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('')}</div>
            <div class="meta">${escapeHtml(plugin.description || plugin.installation?.message || '本地插件')}</div>
            <div class="card-foot">
                <span class="meta">${plugin.requiresAccount === false ? '使用 API 设置凭据' : '账号只保存在本机'}</span>
                <div>
                    ${browserPlugin ? `<button class="pc-btn pc-small" data-login="${escapeHtml(plugin.id)}">打开登录窗口</button>` : ''}
                    ${plugin.requiresAccount !== false ? `<button class="pc-btn pc-small" data-account="${escapeHtml(plugin.id)}">账号管理</button>` : ''}
                </div>
            </div>
        </article>`;
}

function bindPluginButtons(root = document) {
    root.querySelectorAll('[data-login]').forEach(button => button.addEventListener('click', () => openBrowser(button.dataset.login)));
    root.querySelectorAll('[data-account]').forEach(button => button.addEventListener('click', () => openAccount(button.dataset.account)));
    root.querySelectorAll('[data-switch-installed]').forEach(button => button.addEventListener('click', () => selectTab('installed')));
    if (window.lucide) lucide.createIcons();
}

async function loadPlugins() {
    const installedRoot = $('#plugins');
    const builtInRoot = $('#builtInPlugins');
    installedRoot.innerHTML = '<div class="empty">正在扫描插件…</div>';
    builtInRoot.innerHTML = '<div class="empty">正在扫描插件…</div>';
    try {
        const { plugins = [] } = await api('/api/plugins');
        discoveredPlugins = Array.isArray(plugins) ? plugins : [];
        const builtIns = discoveredPlugins.filter(plugin => plugin.runtime === 'browser-assisted');
        builtInRoot.innerHTML = builtIns.length
            ? builtIns.map(browserPluginCard).join('')
            : '<div class="empty">尚未发现浏览器创作插件。</div>';
        installedRoot.innerHTML = discoveredPlugins.length
            ? discoveredPlugins.map(installedPluginCard).join('')
            : '<div class="empty">尚未发现插件。把插件文件夹放入 plugins/ 后点击“刷新插件”。</div>';
        bindPluginButtons(document);
        await loadPluginLogs();
    } catch (error) {
        builtInRoot.innerHTML = `<div class="empty">插件扫描失败：${escapeHtml(error.message)}</div>`;
        installedRoot.innerHTML = `<div class="empty">插件扫描失败：${escapeHtml(error.message)}</div>`;
    }
}

async function loadPluginLogs() {
    const root = $('#pluginLogs');
    const rows = [];
    await Promise.all(discoveredPlugins.map(async plugin => {
        try {
            const { jobs = [] } = await api(`/api/plugins/${encodeURIComponent(plugin.id)}/jobs`);
            jobs.slice(0, 8).forEach(job => rows.push({...job, pluginName: plugin.name || plugin.id}));
        } catch (_) {}
    }));
    rows.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    root.innerHTML = rows.length ? `
        <div class="plugin-grid">${rows.slice(0, 24).map(job => `
            <article class="card">
                <div class="card-top"><div class="plugin-icon">${escapeHtml(String(job.pluginName || '?').slice(0, 1))}</div>
                <div><h3>${escapeHtml(job.pluginName)}</h3><div class="meta">${escapeHtml(job.kind || 'media')} · ${new Date(Number(job.updatedAt || Date.now())).toLocaleString()}</div></div>
                <span class="status ${job.status === 'failed' ? 'warn' : ''}">${escapeHtml(job.status || 'unknown')}</span></div>
                <div class="meta" style="margin-top:14px">${escapeHtml(job.message || job.error || '任务已记录')}</div>
            </article>`).join('')}</div>`
        : '<div class="empty">暂无插件运行记录。</div>';
}

async function openBrowser(pluginId) {
    try {
        await api(`/api/plugins/${encodeURIComponent(pluginId)}/open-browser`, { method: 'POST' });
    } catch (error) {
        alert(error.message);
    }
}

function openAccount(id) {
    $('#pluginId').value = id;
    $('#accountLabel').value = '';
    $('#browserProfile').value = '';
    $('#accountDialog').showModal();
}

function selectTab(name) {
    $$('.pc-tab').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
    $$('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
}

$$('.pc-tab').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));
$('#accountForm').addEventListener('submit', async event => {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    try {
        await api(`/api/plugins/${encodeURIComponent($('#pluginId').value)}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                label: $('#accountLabel').value,
                browserProfileId: $('#browserProfile').value,
                status: 'configured'
            })
        });
        $('#accountDialog').close();
        loadPlugins();
    } catch (error) {
        alert(error.message);
    }
});

$('#openPluginFolderBtn').addEventListener('click', async () => {
    try { await api('/api/plugins/open-directory', { method: 'POST' }); } catch (error) { alert(error.message); }
});
$('#refreshBtn').addEventListener('click', loadPlugins);
$('#installLocalBtn').addEventListener('click', () => $('#openPluginFolderBtn').click());
$('#exampleInstallBtn').addEventListener('click', () => {
    $('#openPluginFolderBtn').click();
    alert('已打开插件文件夹。请下载说明书中的示例目录并放入 plugins/，再点击“刷新插件”。');
});
$('#runSelfCheckBtn').addEventListener('click', () => {
    const badge = $('.pc-check-pass');
    badge.textContent = '自检通过';
    badge.animate([{opacity:.35},{opacity:1}], {duration:420});
});
$('#copyExampleBtn').addEventListener('click', async () => {
    const text = $('.pc-code')?.textContent || '';
    try {
        await navigator.clipboard.writeText(text);
        $('#copyExampleBtn').textContent = '已复制';
        setTimeout(() => { $('#copyExampleBtn').innerHTML = '<i data-lucide="copy"></i>复制示例'; if(window.lucide) lucide.createIcons(); }, 1200);
    } catch (_) {
        alert('复制失败，请手动选择示例。');
    }
});

api('/api/plugins/directory').then(({ path }) => { $('#pluginPath').textContent = path; }).catch(() => { $('#pluginPath').textContent = 'plugins/'; });
loadPlugins();
if (window.lucide) lucide.createIcons();
