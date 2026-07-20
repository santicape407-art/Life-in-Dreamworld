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
    const storage = firebase.storage();

    function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }
    function now() { return new Date().toISOString(); }

    const K = { CONTENT: 'lid_c', LOGS: 'lid_l', USERS_META: 'lid_um', SESSION: 'lid_s' };
    function ls(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
    function ss(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

    const CONTENT_TYPES = ['temporadas','personajes','comics','lore','lugares','anuncios','capitulos'];

    function defaultContent() {
        const c = {};
        CONTENT_TYPES.forEach(t => c[t] = []);
        return c;
    }

    let contentCache = ls(K.CONTENT) || defaultContent();
    let usersMetaCache = ls(K.USERS_META) || [];
    let logsCache = ls(K.LOGS) || [];
    let onUpdateCallback = null;

    function saveLocal() {
        ss(K.CONTENT, contentCache);
        ss(K.USERS_META, usersMetaCache);
        ss(K.LOGS, logsCache);
    }

    function addLog(user, action, detail) {
        logsCache.unshift({ id: uid(), user, action, detail, at: now() });
        if (logsCache.length > 200) logsCache.length = 200;
    }

    // Subir imagen base64 a Firebase Storage, devolver URL pública
    async function uploadImage(base64, itemId) {
        if (!base64 || !base64.startsWith('data:image')) return base64;
        try {
            const ext = base64.split(';')[0].split('/')[1] || 'png';
            const path = `images/${itemId}_${Date.now()}.${ext}`;
            const ref = storage.ref(path);
            await ref.putString(base64, 'data_url');
            const url = await ref.getDownloadURL();
            return url;
        } catch(e) {
            console.warn('Image upload failed:', e.message);
            return base64;
        }
    }

    // Preparar items para Firestore: subir imágenes y reemplazar base64 con URL
    async function prepareForFirestore(items) {
        const prepared = [];
        for (const item of items) {
            const clean = { ...item };
            if (clean.image && clean.image.startsWith('data:image')) {
                clean.image = await uploadImage(clean.image, item.id);
            }
            prepared.push(clean);
        }
        return prepared;
    }

    async function pushType(type) {
        try {
            const items = contentCache[type] || [];
            const prepared = await prepareForFirestore(items);
            await db.collection('content').doc(type).set({ items: prepared });
        } catch(e) { console.warn('Push failed:', type, e.message); }
    }

    async function syncToFirestore() {
        try {
            await Promise.all(CONTENT_TYPES.map(t => pushType(t)));
            await db.collection('site').doc('users_meta').set({ list: usersMetaCache });
            await db.collection('site').doc('logs').set({ list: logsCache.slice(0, 200) });
            console.log('✓ Pushed to Firestore');
        } catch(e) {
            console.warn('✗ Push failed:', e.message);
        }
    }

    // Listeners en tiempo real: Firestore → local cache
    function startRealtimeListeners() {
        CONTENT_TYPES.forEach(type => {
            db.collection('content').doc(type).onSnapshot(snap => {
                if (!snap.exists) return;
                const cloudItems = snap.data().items || [];
                const localItems = contentCache[type] || [];
                const map = new Map();
                localItems.forEach(i => map.set(i.id, i));
                let changed = false;
                cloudItems.forEach(i => {
                    if (!map.has(i.id)) { map.set(i.id, i); changed = true; }
                    else {
                        const local = map.get(i.id);
                        if (i.up && local.up && i.up > local.up) {
                            map.set(i.id, { ...i, image: i.image || local.image });
                            changed = true;
                        }
                    }
                });
                localItems.forEach(i => {
                    if (!cloudItems.find(c => c.id === i.id)) { map.delete(i.id); changed = true; }
                });
                if (changed) {
                    contentCache[type] = [...map.values()];
                    saveLocal();
                    console.log(`↻ Realtime update: ${type}`);
                    if (onUpdateCallback) onUpdateCallback(type);
                }
            }, e => console.warn('Listener error:', type, e.message));
        });

        db.collection('site').doc('users_meta').onSnapshot(snap => {
            if (!snap.exists) return;
            const cloudU = snap.data().list || [];
            const map = new Map();
            usersMetaCache.forEach(u => map.set(u.id, u));
            cloudU.forEach(u => map.set(u.id, u));
            usersMetaCache = [...map.values()];
            saveLocal();
        });

        db.collection('site').doc('logs').onSnapshot(snap => {
            if (!snap.exists) return;
            logsCache = snap.data().list || [];
            saveLocal();
        });
    }

    // Init
    const initPromise = (async () => {
        try {
            const typeSnaps = await Promise.all(
                CONTENT_TYPES.map(t => db.collection('content').doc(t).get())
            );
            const oldSnap = await db.collection('site').doc('content').get();
            const uSnap = await db.collection('site').doc('users_meta').get();

            typeSnaps.forEach((snap, i) => {
                const type = CONTENT_TYPES[i];
                const cloudItems = snap.exists ? (snap.data().items || []) : [];
                const localItems = contentCache[type] || [];
                const map = new Map();
                localItems.forEach(item => map.set(item.id, item));
                cloudItems.forEach(item => {
                    if (!map.has(item.id)) {
                        map.set(item.id, item);
                    } else {
                        const local = map.get(item.id);
                        map.set(item.id, { ...item, image: local.image || item.image });
                    }
                });
                contentCache[type] = [...map.values()];
            });

            if (oldSnap.exists) {
                const oldData = oldSnap.data();
                let migrated = false;
                CONTENT_TYPES.forEach(type => {
                    const oldItems = oldData[type] || [];
                    if (oldItems.length > 0) {
                        const map = new Map();
                        (contentCache[type] || []).forEach(i => map.set(i.id, i));
                        oldItems.forEach(i => map.set(i.id, i));
                        contentCache[type] = [...map.values()];
                        migrated = true;
                    }
                });
            }

            if (uSnap.exists) {
                const cloudU = uSnap.data().list || [];
                const map = new Map();
                usersMetaCache.forEach(u => map.set(u.id, u));
                cloudU.forEach(u => map.set(u.id, u));
                usersMetaCache = [...map.values()];
            }

            if (!usersMetaCache.find(u => u.email === 'santicape407@gmail.com')) {
                usersMetaCache.push({
                    id: 'admin_main', email: 'santicape407@gmail.com',
                    name: 'Administrador', role: 'admin', active: true, at: now()
                });
            }

            saveLocal();
            syncToFirestore();
            startRealtimeListeners();
            console.log('✓ Init complete, realtime active');
        } catch(e) {
            console.warn('Init error:', e);
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

    function getContent(type) { return (contentCache || {})[type] || []; }
    function getItem(type, id) { return (contentCache[type] || []).find(x => x.id === id); }

    function addItem(type, d, user) {
        if (!contentCache[type]) contentCache[type] = [];
        const item = { id: uid(), ...d, by: user, at: now(), up: now() };
        contentCache[type].push(item);
        addLog(user, 'create', `${type}: ${d.title||''}`);
        saveLocal();
        pushType(type);
        return { ok: true, item };
    }

    function updateItem(type, id, d, user) {
        const list = contentCache[type] || [];
        const i = list.findIndex(x => x.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(list[i], d, { up: now() });
        addLog(user, 'update', `${type}: ${d.title||''}`);
        saveLocal();
        pushType(type);
        return { ok: true };
    }

    function deleteItem(type, id, user) {
        const list = contentCache[type] || [];
        const item = list.find(x => x.id === id);
        contentCache[type] = list.filter(x => x.id !== id);
        addLog(user, 'delete', `${type}: ${item?.title||id}`);
        saveLocal();
        pushType(type);
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
    function onUpdate(cb) { onUpdateCallback = cb; }

    return {
        initPromise, login, logout, getSession,
        getUsers, getUser, addUser, updateUser, deleteUser,
        getRoles,
        getContent, getItem, addItem, updateItem, deleteItem, allContent,
        getEmails, addEmail, removeEmail, getLogs, uid, onUpdate
    };
})();
