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

    let contentCache = ls(K.CONTENT) || defaultContent();
    let usersMetaCache = ls(K.USERS_META) || [];
    let logsCache = ls(K.LOGS) || [];

    // SIEMPRE guardar en localStorage primero, Firestore en background
    function saveContentLocal() { ss(K.CONTENT, contentCache); }
    function saveLogsLocal() { ss(K.LOGS, logsCache); }
    function saveUsersMetaLocal() { ss(K.USERS_META, usersMetaCache); }

    let syncPending = false;
    async function syncToFirestore() {
        if (syncPending) return;
        syncPending = true;
        try {
            await db.collection('site').doc('content').set(contentCache);
            await db.collection('site').doc('users_meta').set({ list: usersMetaCache });
            await db.collection('site').doc('logs').set({ list: logsCache.slice(0, 300) });
            console.log('Synced to Firestore');
        } catch(e) {
            console.warn('Firestore sync failed, retrying in 3s:', e.message);
            setTimeout(() => { syncPending = false; syncToFirestore(); }, 3000);
            return;
        }
        syncPending = false;
    }

    function addLog(user, action, detail) {
        logsCache.unshift({ id: uid(), user, action, detail, at: now() });
        if (logsCache.length > 300) logsCache.length = 300;
        saveLogsLocal();
    }

    // Init: cargar de Firestore y mezclar bidireccionalmente
    const initPromise = (async () => {
        try {
            const [cSnap, uSnap, lSnap] = await Promise.all([
                db.collection('site').doc('content').get(),
                db.collection('site').doc('users_meta').get(),
                db.collection('site').doc('logs').get()
            ]);

            const cloudContent = cSnap.exists ? cSnap.data() : null;
            const cloudUsers = uSnap.exists ? uSnap.data().list : null;
            const cloudLogs = lSnap.exists ? lSnap.data().list : null;

            if (cloudContent) {
                // Mezclar bidireccionalmente
                for (const type in contentCache) {
                    const cloudItems = cloudContent[type] || [];
                    const localItems = contentCache[type] || [];
                    const allIds = new Map();
                    localItems.forEach(i => allIds.set(i.id, i));
                    cloudItems.forEach(i => { if (!allIds.has(i.id)) allIds.set(i.id, i); });
                    contentCache[type] = [...allIds.values()];
                }
                // También agregar tipos que solo existen en cloud
                for (const type in cloudContent) {
                    if (!contentCache[type]) contentCache[type] = cloudContent[type] || [];
                }
                saveContentLocal();
            }

            // SIEMPRE subir a Firestore lo que tengamos local
            syncToFirestore();

            if (cloudUsers) {
                const allIds = new Map();
                usersMetaCache.forEach(u => allIds.set(u.id, u));
                cloudUsers.forEach(u => { if (!allIds.has(u.id)) allIds.set(u.id, u); });
                usersMetaCache = [...allIds.values()];
                saveUsersMetaLocal();
            }

            if (!usersMetaCache.find(u => u.email === 'santicape407@gmail.com')) {
                usersMetaCache.push({
                    id: 'admin_main', email: 'santicape407@gmail.com',
                    name: 'Administrador', role: 'admin', active: true, at: now()
                });
                saveUsersMetaLocal();
            }
            syncToFirestore();
        } catch(e) {
            console.warn('Firestore init error:', e);
            if (!usersMetaCache.find(u => u.email === 'santicape407@gmail.com')) {
                usersMetaCache.push({
                    id: 'admin_main', email: 'santicape407@gmail.com',
                    name: 'Administrador', role: 'admin', active: true, at: now()
                });
                saveUsersMetaLocal();
            }
        }
    })();

    // Auth
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
            const msgs = { 'auth/user-not-found': 'Correo no registrado', 'auth/wrong-password': 'Contraseña incorrecta', 'auth/invalid-credential': 'Credenciales incorrectas' };
            return { err: msgs[e.code] || e.message };
        }
    }

    async function logout() {
        try { await auth.signOut(); } catch {}
        localStorage.removeItem(K.SESSION);
    }

    function getSession() { try { return JSON.parse(localStorage.getItem(K.SESSION)); } catch { return null; } }

    // Users Meta
    function getUsers() { return usersMetaCache; }
    function getUser(id) { return usersMetaCache.find(u => u.id === id); }

    function addUser(d) {
        if (usersMetaCache.find(u => u.email === d.email)) return { err: 'Correo ya registrado' };
        const u = { id: uid(), email: d.email, name: d.name||'', role: d.role||'editor', active: true, at: now() };
        usersMetaCache.push(u);
        saveUsersMetaLocal();
        addLog('system', 'create_user', u.email);
        return { ok: true };
    }

    function updateUser(id, d) {
        const i = usersMetaCache.findIndex(u => u.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(usersMetaCache[i], d);
        saveUsersMetaLocal();
        addLog('system', 'update_user', usersMetaCache[i].email);
        return { ok: true };
    }

    function deleteUser(id) {
        const u = usersMetaCache.find(x => x.id === id);
        usersMetaCache = usersMetaCache.filter(x => x.id !== id);
        saveUsersMetaLocal();
        if (u) addLog('system', 'delete_user', u.email);
        return { ok: true };
    }

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

    function addItem(type, d, user) {
        if (!contentCache[type]) contentCache[type] = [];
        const item = { id: uid(), ...d, by: user, at: now(), up: now() };
        contentCache[type].push(item);
        saveContentLocal();
        addLog(user, 'create', `${type}: ${d.title||''}`);
        syncToFirestore();
        return { ok: true, item };
    }

    function updateItem(type, id, d, user) {
        const list = contentCache[type] || [];
        const i = list.findIndex(x => x.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(list[i], d, { up: now() });
        saveContentLocal();
        addLog(user, 'update', `${type}: ${d.title||''}`);
        syncToFirestore();
        return { ok: true };
    }

    function deleteItem(type, id, user) {
        const list = contentCache[type] || [];
        const item = list.find(x => x.id === id);
        contentCache[type] = list.filter(x => x.id !== id);
        saveContentLocal();
        addLog(user, 'delete', `${type}: ${item?.title||id}`);
        syncToFirestore();
        return { ok: true };
    }

    function allContent() {
        const r = [];
        for (const t in contentCache) (contentCache[t] || []).forEach(i => r.push({ ...i, _t: t }));
        return r.sort((a, b) => new Date(b.at) - new Date(a.at));
    }

    function getLogs() { return logsCache; }

    function getEmails() { return []; }
    function addEmail() { return { ok: true }; }
    function removeEmail() { return { ok: true }; }

    return {
        initPromise, login, logout, getSession,
        getUsers, getUser, addUser, updateUser, deleteUser,
        getRoles,
        getContent, getItem, addItem, updateItem, deleteItem, allContent,
        getEmails, addEmail, removeEmail, getLogs, uid
    };
})();
