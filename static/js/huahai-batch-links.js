(function initHuahaiBatchLinks(global) {
    'use strict';

    const uniqueIds = values => Array.from(new Set((values || []).map(value => String(value || '')).filter(Boolean)));

    function validate({
        sourceIds = [],
        targetId = '',
        nodes = [],
        connections = [],
        canConnect = () => false,
        kind = 'flow'
    } = {}) {
        const byId = new Map((nodes || []).filter(Boolean).map(node => [String(node.id || ''), node]));
        const target = byId.get(String(targetId || ''));
        const compatible = [];
        const conflicts = [];
        const sources = uniqueIds(sourceIds);

        sources.forEach(sourceId => {
            const source = byId.get(sourceId);
            let reason = '';
            if (!source) reason = 'missing-source';
            else if (!target) reason = 'missing-target';
            else if (sourceId === String(targetId || '')) reason = 'self';
            else if ((connections || []).some(connection =>
                String(connection.from || '') === sourceId &&
                String(connection.to || '') === String(targetId || '') &&
                String(connection.kind || 'flow') === String(kind || 'flow')
            )) reason = 'duplicate';
            else if (!canConnect(sourceId, String(targetId || ''), source, target)) reason = 'incompatible';

            if (reason) conflicts.push({sourceId, source, reason});
            else compatible.push({sourceId, source});
        });

        return {
            targetId: String(targetId || ''),
            target,
            sourceIds: sources,
            compatible,
            conflicts,
            total: sources.length,
            compatibleCount: compatible.length,
            conflictCount: conflicts.length,
            status: !compatible.length ? 'none' : conflicts.length ? 'partial' : 'all'
        };
    }

    function createConnections({
        validation,
        createId = index => `batch-${Date.now().toString(36)}-${index}`,
        kind = 'flow',
        batchId = `batch-${Date.now().toString(36)}`
    } = {}) {
        if (!validation || !validation.targetId) return [];
        return (validation.compatible || []).map((item, index) => ({
            id: createId(index),
            from: item.sourceId,
            to: validation.targetId,
            kind,
            batch_id: batchId
        }));
    }

    function reasonLabel(reason, english = false) {
        const labels = english
            ? {
                'missing-source': 'Source is unavailable',
                'missing-target': 'Target is unavailable',
                self: 'Cannot connect a node to itself',
                duplicate: 'Connection already exists',
                incompatible: 'Port types are incompatible'
            }
            : {
                'missing-source': '来源节点不存在',
                'missing-target': '目标节点不存在',
                self: '不能连接到自身',
                duplicate: '连接已经存在',
                incompatible: '端口类型不兼容'
            };
        return labels[reason] || (english ? 'Cannot connect' : '无法连接');
    }

    global.HuahaiBatchLinks = Object.freeze({
        validate,
        createConnections,
        reasonLabel
    });
})(window);
