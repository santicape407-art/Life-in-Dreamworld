const DB = (() => {
    const firebaseConfig = {
        apiKey: "AIzaSyDMW7T11zuuSv87z6vErEFPBg6_ZcSG4CE",
        authDomain: "life-in-dreamworld.firebaseapp.com",
        projectId: "life-in-dreamworld",
        storageBucket: "life-in-dreamworld.firebasestorage.app",
        messagingSenderId: "748350579418",
        appId: "1:748350579418:web:33caa3164c3ae1cad1bbe3"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const auth = firebase.auth();

    function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }
    function now() { return new Date().toISOString(); }

    const K = { CONTENT: 'lid_c', LOGS: 'lid_l', USERS_META: 'lid_um', SESSION: 'lid_s' };

    function ls(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
    function ss(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

    function defaultContent() {
        return { temporadas: [], personajes: [], comics: [], lore: [], lugares: [], anuncios: [], capitulos: [] };
    }

    // Cache
    let contentCache = null;
    let usersMetaCache = [];
    let logsCache = [];

    // Cargar contenido desde Firestore
    async function loadContent() {
        try {
            const snap = await db.collection('site').doc('content').get();
            contentCache = snap.exists ? snap.data() : defaultContent();
            ss(K.CONTENT, contentCache);
        } catch(e) {
            console.warn('Firestore read error:', e);
            contentCache = ls(K.CONTENT) || defaultContent();
        }
    }

    async function saveContent() {
        try {
            await db.collection('site').doc('content').set(contentCache);
            ss(K.CONTENT, contentCache);
        } catch(e) { console.warn('Firestore write error:', e); }
    }

    async function loadUsersMeta() {
        try {
            const snap = await db.collection('site').doc('users_meta').get();
            usersMetaCache = snap.exists ? snap.data().list : [];
            ss(K.USERS_META, usersMetaCache);
        } catch(e) {
            usersMetaCache = ls(K.USERS_META) || [];
        }
    }

    async function saveUsersMeta() {
        try {
            await db.collection('site').doc('users_meta').set({ list: usersMetaCache });
            ss(K.USERS_META, usersMetaCache);
        } catch(e) { console.warn('Firestore write error:', e); }
    }

    async function loadLogs() {
        try {
            const snap = await db.collection('site').doc('logs').get();
            logsCache = snap.exists ? snap.data().list : [];
        } catch(e) {
            logsCache = ls(K.LOGS) || [];
        }
    }

    async function saveLogs() {
        try {
            await db.collection('site').doc('logs').set({ list: logsCache.slice(0, 300) });
        } catch(e) { console.warn('Firestore write error:', e); }
    }

    function addLog(user, action, detail) {
        logsCache.unshift({ id: uid(), user, action, detail, at: now() });
        if (logsCache.length > 300) logsCache.length = 300;
        saveLogs();
    }

    // Init
    const initPromise = (async () => {
        contentCache = ls(K.CONTENT) || defaultContent();
        usersMetaCache = ls(K.USERS_META) || [];
        await Promise.all([loadContent(), loadUsersMeta(), loadLogs()]);
        // Asegurar admin en users_meta
        if (!usersMetaCache.find(u => u.email === 'santicape407@gmail.com')) {
            usersMetaCache.push({
                id: 'admin_main', email: 'santicape407@gmail.com',
                name: 'Administrador', role: 'admin', active: true, at: now()
            });
            await saveUsersMeta();
        }
    })();

    // Auth - usa Firebase Authentication
    async function register(email, pass, name) {
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, pass);
            const meta = { id: cred.user.uid, email, name: name || '', role: 'editor', active: true, at: now() };
            usersMetaCache.push(meta);
            await saveUsersMeta();
            addLog('system', 'create_user', email);
            ss(K.SESSION, { id: cred.user.uid, email, name: name || '', role: 'editor' });
            return { ok: true };
        } catch(e) {
            const msgs = { 'auth/email-already-in-use': 'Correo ya registrado', 'auth/weak-password': 'Contraseña muy débil', 'auth/invalid-email': 'Correo inválido' };
            return { err: msgs[e.code] || e.message };
        }
    }

    async function login(email, pass) {
        try {
            await auth.signInWithEmailAndPassword(email, pass);
            const meta = usersMetaCache.find(u => u.email === email);
            if (meta && !meta.active) {
                await auth.signOut();
                return { err: 'Cuenta desactivada' };
            }
            const role = meta?.role || 'editor';
            ss(K.SESSION, { id: auth.currentUser.uid, email, name: meta?.name || '', role });
            return { ok: true };
        } catch(e) {
            const msgs = { 'auth/user-not-found': 'Correo no registrado', 'auth/wrong-password': 'Contraseña incorrecta', 'auth/invalid-email': 'Correo inválido', 'auth/invalid-credential': 'Credenciales incorrectas' };
            return { err: msgs[e.code] || e.message };
        }
    }

    async function logout() {
        await auth.signOut();
        localStorage.removeItem(K.SESSION);
    }

    function getSession() {
        try { return JSON.parse(localStorage.getItem(K.SESSION)); } catch { return null; }
    }

    function canWrite() {
        return auth.currentUser !== null;
    }

    // Users Meta (para admin)
    function getUsers() { return usersMetaCache; }
    function getUser(id) { return usersMetaCache.find(u => u.id === id); }

    async function addUser(d) {
        if (usersMetaCache.find(u => u.email === d.email)) return { err: 'Correo ya registrado' };
        const u = { id: uid(), email: d.email, name: d.name||'', role: d.role||'editor', active: true, at: now() };
        usersMetaCache.push(u);
        await saveUsersMeta();
        addLog('system', 'create_user', u.email);
        return { ok: true, tempPass: d.pass, tempEmail: d.email };
    }

    async function updateUser(id, d) {
        const i = usersMetaCache.findIndex(u => u.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(usersMetaCache[i], d);
        await saveUsersMeta();
        addLog('system', 'update_user', usersMetaCache[i].email);
        return { ok: true };
    }

    async function deleteUser(id) {
        const u = usersMetaCache.find(x => x.id === id);
        usersMetaCache = usersMetaCache.filter(x => x.id !== id);
        await saveUsersMeta();
        if (u) addLog('system', 'delete_user', u.email);
        return { ok: true };
    }

    // Roles (hardcoded, se pueden cambiar)
    function getRoles() {
        return [
            { id: 'admin', name: 'Administrador', perms: ['create','read','update','delete','manage'] },
            { id: 'mod', name: 'Moderador', perms: ['create','read','update','delete'] },
            { id: 'editor', name: 'Editor', perms: ['create','read','update'] }
        ];
    }

    // Content
    function getContent(type) { return (contentCache || {})[type] || []; }
    function getItem(type, id) { return (contentCache[type] || []).find(x => x.id === id); }

    async function addItem(type, d, user) {
        if (!contentCache[type]) contentCache[type] = [];
        const item = { id: uid(), ...d, by: user, at: now(), up: now() };
        contentCache[type].push(item);
        await saveContent();
        addLog(user, 'create', `${type}: ${d.title||''}`);
        return { ok: true, item };
    }

    async function updateItem(type, id, d, user) {
        const list = contentCache[type] || [];
        const i = list.findIndex(x => x.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(list[i], d, { up: now() });
        await saveContent();
        addLog(user, 'update', `${type}: ${d.title||''}`);
        return { ok: true };
    }

    async function deleteItem(type, id, user) {
        const list = contentCache[type] || [];
        const item = list.find(x => x.id === id);
        contentCache[type] = list.filter(x => x.id !== id);
        await saveContent();
        addLog(user, 'delete', `${type}: ${item?.title||id}`);
        return { ok: true };
    }

    function allContent() {
        const r = [];
        for (const t in contentCache) (contentCache[t] || []).forEach(i => r.push({ ...i, _t: t }));
        return r.sort((a, b) => new Date(b.at) - new Date(a.at));
    }

    // Logs
    function getLogs() { return logsCache; }

    // Emails (ya no se necesita, Firebase Auth maneja esto)
    function getEmails() { return []; }
    function addEmail() { return { ok: true }; }
    function removeEmail() { return { ok: true }; }

    return {
        initPromise, login, register, logout, getSession, canWrite,
        getUsers, getUser, addUser, updateUser, deleteUser,
        getRoles,
        getContent, getItem, addItem, updateItem, deleteItem, allContent,
        getEmails, addEmail, removeEmail, getLogs, uid
    };
})();
