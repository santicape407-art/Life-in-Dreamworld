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

    const CONTENT_TYPES = ['temporadas','personajes','comics','lore','lugares','anuncios','capitulos'];

    function defaultContent() {
        return { temporadas: [], personajes: [], comics: [], lore: [], lugares: [], anuncios: [], capitulos: [] };
    }

    let contentCache = ls(K.CONTENT) || defaultContent();
    let usersMetaCache = ls(K.USERS_META) || [];
    let logsCache = ls(K.LOGS) || [];

    function saveLocal() {
        ss(K.CONTENT, contentCache);
        ss(K.USERS_META, usersMetaCache);
        ss(K.LOGS, logsCache);
    }

    // Sync: cada tipo de contenido en su propio documento para no exceder 1MB
    let syncing = false;
    let syncQueued = false;

    async function syncToFirestore() {
        if (syncQueued) return;
        syncQueued = true;
        while (syncing) { await new Promise(r => setTimeout(r, 500)); syncQueued = false; }
        syncing = true;
        try {
            const batch = db.batch();
            CONTENT_TYPES.forEach(type => {
                const ref = db.collection('content').doc(type);
                batch.set(ref, { items: contentCache[type] || [] });
            });
            batch.set(db.collection('site').doc('users_meta'), { list: usersMetaCache });
            batch.set(db.collection('site').doc('logs'), { list: logsCache.slice(0, 200) });
            await batch.commit();
            console.log('✓ Synced to Firestore');
        } catch(e) {
            console.warn('✗ Firestore sync failed:', e.message);
            setTimeout(() => { syncing = false; syncToFirestore(); }, 2000);
            return;
        }
        syncing = false;
    }

    function addLog(user, action, detail) {
        logsCache.unshift({ id: uid(), user, action, detail, at: now() });
        if (logsCache.length > 200) logsCache.length = 200;
    }

    // Init: cargar desde Firestore, mezclar con local
    const initPromise = (async () => {
        try {
            // Cargar cada tipo por separado
            const typeSnaps = await Promise.all(
                CONTENT_TYPES.map(t => db.collection('content').doc(t).get())
            );
            const uSnap = await db.collection('site').doc('users_meta').get();

            typeSnaps.forEach((snap, i) => {
                const type = CONTENT_TYPES[i];
                const cloudItems = snap.exists ? (snap.data().items || []) : [];
                const localItems = contentCache[type] || [];
                const map = new Map();
                localItems.forEach(item => map.set(item.id, item));
                cloudItems.forEach(item => { if (!map.has(item.id)) map.set(item.id, item); });
                contentCache[type] = [...map.values()];
            });

            // Mezclar usuarios
            if (uSnap.exists) {
                const cloudU = uSnap.data().list || [];
                const map = new Map();
                usersMetaCache.forEach(u => map.set(u.id, u));
                cloudU.forEach(u => { if (!map.has(u.id)) map.set(u.id, u); });
                usersMetaCache = [...map.values()];
            }

            // Asegurar admin
            if (!usersMetaCache.find(u => u.email === 'santicape407@gmail.com')) {
                usersMetaCache.push({
                    id: 'admin_main', email: 'santicape407@gmail.com',
                    name: 'Administrador', role: 'admin', active: true, at: now()
                });
            }

            saveLocal();
            syncToFirestore();
        } catch(e) {
            console.warn('Firestore init error:', e);
        }
    })();

    // Auth
    async function login(email, pass) {
        try {
            await auth.signInWithEmailAndPassword(email, pass);
            const meta = usersMetaCache.find(u => u.email === email);
            if (meta && !meta.active) { await auth.signOut(); return { err: 'Cuenta desactivada' }; }
            ss(K.SESSION, { id: auth.currentUser.uid, email, name: meta?.name || '', role: meta?.role || 'editor' });
            return { ok: true };
        } catch(e) {
            const msgs = { 'auth/user-not-found': 'Correo no registrado', 'auth/wrong-password': 'Contraseña incorrecta', 'auth/invalid-credential': 'Credenciales incorrectas' };
            return { err: msgs[e.code] || e.message };
        }
    }

    async function logout() { try { await auth.signOut(); } catch {} localStorage.removeItem(K.SESSION); }
    function getSession() { try { return JSON.parse(localStorage.getItem(K.SESSION)); } catch { return null; } }

    // Users
    function getUsers() { return usersMetaCache; }
    function getUser(id) { return usersMetaCache.find(u => u.id === id); }

    function addUser(d) {
        if (usersMetaCache.find(u => u.email === d.email)) return { err: 'Correo ya registrado' };
        const u = { id: uid(), email: d.email, name: d.name||'', role: d.role||'editor', active: true, at: now() };
        usersMetaCache.push(u);
        addLog('system', 'create_user', u.email);
        saveLocal(); syncToFirestore();
        return { ok: true };
    }

    function updateUser(id, d) {
        const i = usersMetaCache.findIndex(u => u.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(usersMetaCache[i], d);
        addLog('system', 'update_user', usersMetaCache[i].email);
        saveLocal(); syncToFirestore();
        return { ok: true };
    }

    function deleteUser(id) {
        const u = usersMetaCache.find(x => x.id === id);
        usersMetaCache = usersMetaCache.filter(x => x.id !== id);
        if (u) addLog('system', 'delete_user', u.email);
        saveLocal(); syncToFirestore();
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
        addLog(user, 'create', `${type}: ${d.title||''}`);
        saveLocal(); syncToFirestore();
        return { ok: true, item };
    }

    function updateItem(type, id, d, user) {
        const list = contentCache[type] || [];
        const i = list.findIndex(x => x.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(list[i], d, { up: now() });
        addLog(user, 'update', `${type}: ${d.title||''}`);
        saveLocal(); syncToFirestore();
        return { ok: true };
    }

    function deleteItem(type, id, user) {
        const list = contentCache[type] || [];
        const item = list.find(x => x.id === id);
        contentCache[type] = list.filter(x => x.id !== id);
        addLog(user, 'delete', `${type}: ${item?.title||id}`);
        saveLocal(); syncToFirestore();
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
