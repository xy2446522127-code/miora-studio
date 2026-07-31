(function(){
    const projectListEl = document.getElementById('projectList');
    const boardWorld = document.getElementById('boardWorld');
    const boardEmpty = document.getElementById('boardEmptyHint');
    const projectNameEl = document.getElementById('boardProjectName');
    const canvasCountEl = document.getElementById('boardCanvasCount');
    const trashPanel = document.getElementById('trashPanel');
    const trashList = document.getElementById('trashList');
    const trashBadge = document.getElementById('trashBadge');
    const statusEl = document.getElementById('boardStatus');
    const newProjectForm = document.getElementById('newProjectForm');
    const newProjectInput = document.getElementById('newProjectInput');
    const canvasDialog = document.getElementById('canvasNameDialog');
    const canvasDialogTitle = document.getElementById('canvasDialogTitle');
    const canvasNameInput = document.getElementById('canvasNameInput');
    const boardResetViewBtn = document.getElementById('boardResetViewBtn');

    let projects = [];
    let canvases = [];
    let deletedCanvases = [];
    let currentProjectId = localStorage.getItem('canvasListCurrentProjectId') || 'default';
    let dialogMode = 'create';
    let dialogCanvasId = '';
    let statusTimer = 0;

    const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[char]));

    function setStatus(message, tone = ''){
        clearTimeout(statusTimer);
        statusEl.textContent = message;
        statusEl.dataset.tone = tone;
        statusEl.classList.add('show');
        statusTimer = setTimeout(() => statusEl.classList.remove('show'), 2600);
    }

    function formatTime(value){
        const raw = Number(value || 0);
        if(!raw) return '--';
        const date = new Date(raw < 10000000000 ? raw * 1000 : raw);
        if(Number.isNaN(date.getTime())) return '--';
        return date.toLocaleString('zh-CN', {
            month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false
        });
    }

    function currentProject(){
        return projects.find(item => item.id === currentProjectId) || projects[0] || null;
    }

    function chronologicalCanvasesInProject(){
        return canvases
            .filter(item => (item.project || 'default') === currentProjectId)
            .slice()
            .sort((a,b) => {
                const byUpdated = Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0);
                return byUpdated || String(a.id).localeCompare(String(b.id));
            });
    }
    function sortedCanvases(){ return chronologicalCanvasesInProject(); }
    function arrangeCurrentProjectDeck(){
        document.getElementById('board')?.scrollTo({left:0, top:0, behavior:'smooth'});
    }
    function resetView(){ arrangeCurrentProjectDeck(); }

    async function api(url, options){
        const response = await fetch(url, options);
        const body = await response.json().catch(() => ({}));
        if(!response.ok) throw new Error(body.detail?.message || body.detail || '请求失败');
        return body;
    }

    function openCanvas(item){
        const id = encodeURIComponent(item.id);
        const project = encodeURIComponent(item.project || currentProjectId || 'default');
        localStorage.setItem('canvasListCurrentProjectId', item.project || currentProjectId || 'default');
        window.location.href = `/static/smart-canvas.html?id=${id}&project=${project}`;
    }

    function projectRow(project){
        const count = canvases.filter(item => (item.project || 'default') === project.id).length;
        const active = project.id === currentProjectId && trashPanel.hidden;
        const canDelete = project.id !== 'default';
        return `
            <div class="hh-project-row-wrap">
                <button class="hh-project-row ${active ? 'active' : ''}" type="button" data-project-id="${escapeHtml(project.id)}">
                    <i data-lucide="folder"></i>
                    <span>${escapeHtml(project.name || '未命名项目')}</span>
                    <b>${count}</b>
                </button>
                ${canDelete ? `<button class="hh-project-more" type="button" data-project-menu="${escapeHtml(project.id)}" title="项目操作"><i data-lucide="more-horizontal"></i></button>` : ''}
            </div>
        `;
    }

    function renderProjects(){
        projectListEl.innerHTML = projects.map(projectRow).join('');
        projectListEl.querySelectorAll('[data-project-id]').forEach(button => {
            button.addEventListener('click', () => {
                currentProjectId = button.dataset.projectId;
                localStorage.setItem('canvasListCurrentProjectId', currentProjectId);
                trashPanel.hidden = true;
                render();
            });
        });
        projectListEl.querySelectorAll('[data-project-menu]').forEach(button => {
            button.addEventListener('click', async event => {
                event.stopPropagation();
                const id = button.dataset.projectMenu;
                const item = projects.find(project => project.id === id);
                if(!item) return;
                const action = window.prompt('输入“重命名”或“删除”', '重命名');
                if(action === '重命名'){
                    const name = window.prompt('项目名称', item.name || '');
                    if(name?.trim()) await renameProject(id, name.trim());
                } else if(action === '删除'){
                    if(window.confirm(`删除项目“${item.name}”？其中画布会移回默认项目。`)) await deleteProject(id);
                }
            });
        });
    }

    function canvasCard(item, index){
        const nodeCount = Array.isArray(item.nodes) ? item.nodes.length : Number(item.node_count || 0);
        return `
            <article class="hh-canvas-card ${index === 0 ? 'featured' : ''}" data-canvas-card="${escapeHtml(item.id)}">
                <div class="hh-card-surface">
                    <div class="hh-card-top">
                        <span>花海画布</span>
                        <button type="button" data-card-menu="${escapeHtml(item.id)}" title="更多操作"><i data-lucide="more-horizontal"></i></button>
                    </div>
                    <h2>${escapeHtml(item.title || '未命名画布')}</h2>
                    <div class="hh-card-ripple" aria-hidden="true"><i></i><i></i><i></i></div>
                    <div class="hh-card-meta">
                        <span><i data-lucide="file"></i>${nodeCount} 节点</span>
                        <time>${escapeHtml(formatTime(item.updated_at || item.created_at))}</time>
                    </div>
                    <div class="hh-card-actions ws-card-focus-actions">
                        <button type="button" class="primary" data-card-open="${escapeHtml(item.id)}">继续编辑 <i data-lucide="arrow-right"></i></button>
                        <button type="button" data-card-rename="${escapeHtml(item.id)}" title="重命名"><i data-lucide="pencil"></i></button>
                        <button type="button" data-card-duplicate="${escapeHtml(item.id)}" title="复制"><i data-lucide="copy"></i></button>
                    </div>
                </div>
                <div class="hh-card-reflection ws-card-reflection" aria-hidden="true"></div>
            </article>
        `;
    }

    function renderBoard(){
        const items = sortedCanvases();
        // 顶栏保持设计稿的稳定信息层级；当前项目由左栏选中态表达。
        projectNameEl.textContent = '项目管理';
        canvasCountEl.textContent = items.length;
        boardWorld.innerHTML = items.map(canvasCard).join('');
        boardEmpty.hidden = items.length !== 0;
        bindCardEvents(items);
        requestAnimationFrame(resetView);
    }

    function bindCardEvents(items){
        const byId = id => items.find(item => String(item.id) === String(id));
        boardWorld.querySelectorAll('[data-card-open]').forEach(button => button.addEventListener('click', () => openCanvas(byId(button.dataset.cardOpen))));
        boardWorld.querySelectorAll('[data-canvas-card]').forEach(card => {
            card.addEventListener('dblclick', event => {
                if(event.target.closest('button')) return;
                openCanvas(byId(card.dataset.canvasCard));
            });
        });
        boardWorld.querySelectorAll('[data-card-rename]').forEach(button => button.addEventListener('click', () => openRenameDialog(byId(button.dataset.cardRename))));
        boardWorld.querySelectorAll('[data-card-duplicate]').forEach(button => button.addEventListener('click', () => duplicateCanvas(button.dataset.cardDuplicate)));
        boardWorld.querySelectorAll('[data-card-menu]').forEach(button => {
            button.addEventListener('click', async () => {
                const id = button.dataset.cardMenu;
                const item = byId(id);
                const action = window.prompt('输入“重命名”、“复制”或“删除”', '重命名');
                if(action === '重命名') openRenameDialog(item);
                else if(action === '复制') await duplicateCanvas(id);
                else if(action === '删除' && window.confirm(`把“${item?.title || '未命名画布'}”移入回收站？`)) await deleteCanvas(id);
            });
        });
        if(window.lucide) lucide.createIcons();
    }

    function render(){
        renderProjects();
        renderBoard();
        if(window.lucide) lucide.createIcons();
    }

    async function loadAll(){
        try {
            const [projectData, canvasData, trashData] = await Promise.all([
                api('/api/projects'),
                api('/api/canvases'),
                api('/api/canvases/trash')
            ]);
            projects = (projectData.projects || []).slice().sort((a,b) => Number(a.order || 0) - Number(b.order || 0));
            canvases = canvasData.canvases || [];
            deletedCanvases = trashData.canvases || [];
            if(!projects.some(item => item.id === currentProjectId)) currentProjectId = projects[0]?.id || 'default';
            trashBadge.textContent = deletedCanvases.length;
            render();
        } catch(error){
            setStatus(error.message || '项目读取失败', 'error');
        }
    }

    async function createProject(name){
        try {
            const result = await api('/api/projects', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({name})
            });
            currentProjectId = result.project?.id || currentProjectId;
            newProjectForm.hidden = true;
            await loadAll();
            setStatus('项目已创建');
        } catch(error){ setStatus(error.message, 'error'); }
    }

    async function renameProject(id, name){
        try {
            await api(`/api/projects/${encodeURIComponent(id)}`, {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({name})
            });
            await loadAll();
            setStatus('项目已重命名');
        } catch(error){ setStatus(error.message, 'error'); }
    }

    async function deleteProject(id){
        try {
            await api(`/api/projects/${encodeURIComponent(id)}`, {method:'DELETE'});
            currentProjectId = 'default';
            await loadAll();
            setStatus('项目已删除，画布已移回默认项目');
        } catch(error){ setStatus(error.message, 'error'); }
    }

    function openCreateDialog(){
        dialogMode = 'create';
        dialogCanvasId = '';
        canvasDialogTitle.textContent = '新建画布';
        canvasNameInput.value = '';
        canvasDialog.showModal();
        setTimeout(() => canvasNameInput.focus(), 0);
    }

    function openRenameDialog(item){
        if(!item) return;
        dialogMode = 'rename';
        dialogCanvasId = item.id;
        canvasDialogTitle.textContent = '重命名画布';
        canvasNameInput.value = item.title || '';
        canvasDialog.showModal();
        setTimeout(() => canvasNameInput.select(), 0);
    }

    async function submitCanvasDialog(){
        const title = canvasNameInput.value.trim() || '未命名画布';
        try {
            if(dialogMode === 'rename'){
                await api(`/api/canvases/${encodeURIComponent(dialogCanvasId)}/meta`, {
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({title})
                });
                setStatus('画布已重命名');
                await loadAll();
            } else {
                const result = await api('/api/canvases', {
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({title, icon:'layers', kind:'smart', project:currentProjectId})
                });
                setStatus('智能画布已创建');
                await loadAll();
                if(result.canvas) openCanvas(result.canvas);
            }
        } catch(error){ setStatus(error.message, 'error'); }
    }

    async function duplicateCanvas(canvasId){
        try {
            const sourceData = await api(`/api/canvases/${encodeURIComponent(canvasId)}`);
            const source = sourceData.canvas || sourceData;
            const title = `${source.title || '未命名画布'} 副本`.slice(0,80);
            const created = await api('/api/canvases', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    title, icon:source.icon || 'layers', kind:'smart',
                    project:source.project || currentProjectId || 'default'
                })
            });
            await api(`/api/canvases/${encodeURIComponent(created.canvas.id)}`, {
                method:'PUT',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    title,
                    icon:source.icon || 'layers',
                    nodes:source.nodes || [],
                    connections:source.connections || [],
                    viewport:source.viewport || {},
                    logs:source.logs || [],
                    settings:source.settings || {}
                })
            });
            await loadAll();
            setStatus('画布已复制');
        } catch(error){ setStatus(error.message, 'error'); }
    }

    async function deleteCanvas(id){
        try {
            await api(`/api/canvases/${encodeURIComponent(id)}`, {method:'DELETE'});
            await loadAll();
            setStatus('画布已移入回收站');
        } catch(error){ setStatus(error.message, 'error'); }
    }

    function renderTrash(){
        trashList.innerHTML = deletedCanvases.length ? deletedCanvases.map(item => `
            <article>
                <div><strong>${escapeHtml(item.title || '未命名画布')}</strong><small>${escapeHtml(formatTime(item.deleted_at || item.updated_at))}</small></div>
                <button type="button" data-trash-restore="${escapeHtml(item.id)}">恢复</button>
                <button type="button" class="danger" data-trash-purge="${escapeHtml(item.id)}">永久删除</button>
            </article>
        `).join('') : '<div class="hh-home-empty">回收站为空</div>';
        trashList.querySelectorAll('[data-trash-restore]').forEach(button => button.addEventListener('click', async () => {
            await api(`/api/canvases/${encodeURIComponent(button.dataset.trashRestore)}/restore`, {method:'POST'});
            await loadAll();
            renderTrash();
            setStatus('画布已恢复');
        }));
        trashList.querySelectorAll('[data-trash-purge]').forEach(button => button.addEventListener('click', async () => {
            if(!window.confirm('永久删除后无法恢复，继续吗？')) return;
            await api(`/api/canvases/${encodeURIComponent(button.dataset.trashPurge)}/purge`, {method:'DELETE'});
            await loadAll();
            renderTrash();
            setStatus('画布已永久删除');
        }));
    }

    document.getElementById('newProjectBtn').addEventListener('click', () => {
        newProjectForm.hidden = false;
        newProjectInput.value = '';
        newProjectInput.focus();
    });
    document.getElementById('newProjectCancel').addEventListener('click', () => { newProjectForm.hidden = true; });
    newProjectForm.addEventListener('submit', event => {
        event.preventDefault();
        const name = newProjectInput.value.trim();
        if(name) createProject(name);
    });
    document.getElementById('boardRefresh').addEventListener('click', loadAll);
    boardResetViewBtn.addEventListener('click', arrangeCurrentProjectDeck);
    document.getElementById('newCanvasBtn').addEventListener('click', openCreateDialog);
    document.getElementById('emptyCreateCanvasBtn').addEventListener('click', openCreateDialog);
    document.getElementById('trashEntry').addEventListener('click', () => {
        trashPanel.hidden = false;
        renderProjects();
        renderTrash();
    });
    document.getElementById('trashClose').addEventListener('click', () => {
        trashPanel.hidden = true;
        render();
    });
    document.getElementById('canvasNameForm').addEventListener('submit', event => {
        if(event.submitter?.value === 'cancel') return;
        event.preventDefault();
        canvasDialog.close();
        submitCanvasDialog();
    });

    loadAll();
    if(window.lucide) lucide.createIcons();
})();
