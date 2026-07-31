import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.HUAHAI_QA_BASE || 'http://127.0.0.1:3000';
const port = Number(process.env.HUAHAI_CDP_PORT || 9223);
const output = path.resolve(
    process.env.HUAHAI_SHELL_QA_OUTPUT
    || 'docs/screenshots/2026.08.01.3/shell-interaction-qa.json'
);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function openPage(url) {
    const response = await fetch(
        `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
        { method: 'PUT' },
    );
    if (!response.ok) throw new Error(`Unable to open visible Chrome tab: ${response.status}`);
    const target = await response.json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    const errors = [];
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const handlers = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) handlers.reject(new Error(message.error.message));
            else handlers.resolve(message.result || {});
        }
        if (message.method === 'Runtime.exceptionThrown') {
            errors.push(message.params?.exceptionDetails?.text || 'Runtime exception');
        }
        if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
            errors.push(message.params.entry.text);
        }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
    });
    await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try {
            localStorage.setItem('studio_theme', 'dark');
            localStorage.setItem('studio_lang', 'zh');
            localStorage.setItem('studio_active_page', 'home');
        } catch (_) {}`,
    });
    await send('Page.navigate', { url });
    await wait(4200);
    return { socket, send, errors };
}

async function evaluate(cdp, expression) {
    const response = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });
    return response.result?.value;
}

const pages = [
    'home',
    'zimage',
    'enhance',
    'klein',
    'angle',
    'online',
    'gpt-chat',
    'canvas',
    'asset-manager',
    'plugin-center',
    'api-settings',
    'comfyui-settings',
];

let cdp;
try {
    cdp = await openPage(`${base}/`);
    const navigation = [];
    for (const page of pages) {
        const result = await evaluate(cdp, `(async () => {
            const page = ${JSON.stringify(page)};
            const trigger = document.querySelector(
                \`.nav-item[onclick*="'\${page}'"], .side-pill[onclick*="'\${page}'"]\`
            );
            switchUI(trigger, page, { skipRemember: false });
            const frame = document.getElementById('frame-' + page);
            for (let i = 0; i < 80; i += 1) {
                let href = '';
                try { href = frame?.contentWindow?.location?.href || ''; } catch (_) {}
                if (
                    frame?.contentDocument?.readyState === 'complete'
                    && href
                    && href !== 'about:blank'
                ) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            const child = frame?.contentDocument;
            return {
                page,
                activePage: document.body.dataset.activePage,
                activeFrame: frame?.classList.contains('active') || false,
                loaded: child?.readyState === 'complete',
                title: child?.title || '',
                bodyText: (child?.body?.innerText || '').trim().length,
                horizontalOverflow: child
                    ? child.documentElement.scrollWidth > frame.contentWindow.innerWidth + 2
                    : true,
                dimensions: child ? {
                    scrollWidth: child.documentElement.scrollWidth,
                    clientWidth: child.documentElement.clientWidth,
                    innerWidth: frame.contentWindow.innerWidth,
                } : null,
                overflowElements: child ? [...child.querySelectorAll('body *')]
                    .map(element => {
                        const rect = element.getBoundingClientRect();
                        return {
                            tag: element.tagName.toLowerCase(),
                            id: element.id || '',
                            className: String(element.className || '').slice(0, 120),
                            left: Math.round(rect.left),
                            right: Math.round(rect.right),
                            width: Math.round(rect.width),
                        };
                    })
                    .filter(item => item.right > child.documentElement.clientWidth + 2 || item.left < -2)
                    .sort((a, b) => b.right - a.right)
                    .slice(0, 8) : [],
                navVisible: trigger ? getComputedStyle(trigger).display !== 'none' : page === 'api-settings' || page === 'comfyui-settings',
            };
        })()`);
        navigation.push(result);
    }

    const preferences = await evaluate(cdp, `(async () => {
        switchUI(document.querySelector('.nav-item[onclick*="gpt-chat"]'), 'gpt-chat', { skipRemember: false });
        const frame = document.getElementById('frame-gpt-chat');
        await new Promise(resolve => setTimeout(resolve, 300));
        const beforeTheme = window.StudioTheme.get();
        toggleTheme();
        await new Promise(resolve => setTimeout(resolve, 220));
        const afterTheme = window.StudioTheme.get();
        const childTheme = frame.contentDocument.documentElement.classList.contains('studio-theme-dark')
            ? 'dark'
            : 'light';
        const beforeLang = window.StudioI18n.lang();
        toggleLanguage();
        for (let i = 0; i < 30; i += 1) {
            if (frame.contentWindow.StudioI18n?.lang?.() === window.StudioI18n.lang()) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        const afterLang = window.StudioI18n.lang();
        const childLang = frame.contentWindow.StudioI18n?.lang?.() || '';
        const remembered = localStorage.getItem('studio_active_page');
        toggleLanguage();
        if (afterTheme !== 'dark') toggleTheme();
        return {
            beforeTheme,
            afterTheme,
            childTheme,
            beforeLang,
            afterLang,
            childLang,
            remembered,
            restoredTheme: window.StudioTheme.get(),
            restoredLang: window.StudioI18n.lang(),
        };
    })()`);

    const assertions = {
        allPagesLoaded: navigation.every(item => item?.loaded && item.activeFrame && item.activePage === item.page),
        allPagesHaveContent: navigation.every(item => Number(item?.bodyText || 0) > 20),
        noPageOverflow: navigation.every(item => !item?.horizontalOverflow),
        allPrimaryNavigationVisible: navigation
            .filter(item => !['api-settings', 'comfyui-settings'].includes(item.page))
            .every(item => item?.navVisible),
        themeBroadcast: preferences.beforeTheme !== preferences.afterTheme
            && preferences.childTheme === preferences.afterTheme,
        languageBroadcast: preferences.beforeLang !== preferences.afterLang
            && preferences.childLang === preferences.afterLang,
        activePageRemembered: preferences.remembered === 'gpt-chat',
        preferencesRestored: preferences.restoredTheme === 'dark' && preferences.restoredLang === 'zh',
        noConsoleErrors: cdp.errors.length === 0,
    };
    const report = {
        generatedAt: new Date().toISOString(),
        browser: 'visible Chrome via CDP',
        viewport: '1440x900',
        navigation,
        preferences,
        consoleErrors: cdp.errors,
        assertions,
        passed: Object.values(assertions).every(Boolean),
    };
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
} finally {
    if (cdp) {
        await cdp.send('Page.close').catch(() => {});
        cdp.socket.close();
    }
}
