const DB = (() => {
    const firebaseConfig = {
        apiKey: "AIzaSyDMW7T11zuuSv87z6vErEFPBg6_ZcSG4CE",
        authDomain: "life-in-dreamworld.firebaseapp.com",
        projectId: "life-in-dreamworld",
        storageBucket: "life-in-dreamworld.firebasestorage.app",
        messagingSenderId: "748350579418",
        appId: "1:748350579418:web:33caa3164c3ae1cad1bbe3"
    };

    let db = null;
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
    } catch(e) { console.warn('Firebase init error:', e); }

    const K = { USERS: 'lid_u', ROLES: 'lid_r', CONTENT: 'lid_c', LOGS: 'lid_l', EMAILS: 'lid_e', SESSION: 'lid_s' };

    function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }
    function now() { return new Date().toISOString(); }
    function ls(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
    function ss(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

    function defaultRoles() {
        return [
            { id: 'admin', name: 'Administrador', perms: ['create','read','update','delete','manage'] },
            { id: 'mod', name: 'Moderador', perms: ['create','read','update','delete'] },
            { id: 'editor', name: 'Editor', perms: ['create','read','update'] }
        ];
    }

    function defaultContent() {
        return { temporadas: [], personajes: [], comics: [], lore: [], lugares: [], anuncios: [], capitulos: [] };
    }

    // Init: cargar desde Firestore y mezclar con localStorage
    async function loadFromCloud() {
        if (!db) return;
        try {
            const [uSnap, rSnap, cSnap, lSnap, eSnap] = await Promise.all([
                db.collection('data').doc('users').get().catch(() => null),
                db.collection('data').doc('roles').get().catch(() => null),
                db.collection('data').doc('content').get().catch(() => null),
                db.collection('data').doc('logs').get().catch(() => null),
                db.collection('data').doc('emails').get().catch(() => null)
            ]);

            const cloudUsers = uSnap?.exists ? uSnap.data().list : null;
            const cloudRoles = rSnap?.exists ? rSnap.data().list : null;
            const cloudContent = cSnap?.exists ? cSnap.data() : null;
            const cloudLogs = lSnap?.exists ? lSnap.data().list : null;
            const cloudEmails = eSnap?.exists ? eSnap.data().list : null;

            // Mezclar: si Firestore tiene datos, úsalos; si no, mantén localStorage
            if (cloudUsers) ss(K.USERS, cloudUsers);
            if (cloudRoles) ss(K.ROLES, cloudRoles);
            if (cloudContent) ss(K.CONTENT, cloudContent);
            if (cloudLogs) ss(K.LOGS, cloudLogs);
            if (cloudEmails) ss(K.EMAILS, cloudEmails);

            console.log('Firestore data loaded and merged');
        } catch(e) { console.warn('Firestore load error:', e); }
    }

    // Guardar en Firestore en background
    function pushToCloud() {
        if (!db) return;
        try {
            db.collection('data').doc('users').set({ list: ls(K.USERS) || [] });
            db.collection('data').doc('roles').set({ list: ls(K.ROLES) || defaultRoles() });
            db.collection('data').doc('content').set(ls(K.CONTENT) || defaultContent());
            db.collection('data').doc('logs').set({ list: (ls(K.LOGS) || []).slice(0, 300) });
            db.collection('data').doc('emails').set({ list: ls(K.EMAILS) || [] });
        } catch(e) { console.warn('Firestore push error:', e); }
    }

    function addLog(user, action, detail) {
        const logs = ls(K.LOGS) || [];
        logs.unshift({ id: uid(), user, action, detail, at: now() });
        if (logs.length > 300) logs.length = 300;
        ss(K.LOGS, logs);
    }

    // Asegurar defaults
    function init() {
        if (!ls(K.ROLES)) ss(K.ROLES, defaultRoles());
        if (!ls(K.CONTENT)) ss(K.CONTENT, defaultContent());
        if (!ls(K.LOGS)) ss(K.LOGS, []);
        if (!ls(K.EMAILS)) ss(K.EMAILS, []);
        const users = ls(K.USERS) || [];
        if (!users.find(u => u.email === 'santicape407@gmail.com')) {
            users.push({ id: 'admin_main', email: 'santicape407@gmail.com', name: 'Administrador', pass: 'Sonicelde2011', role: 'admin', active: true, at: now() });
            ss(K.USERS, users);
        }
        const emails = ls(K.EMAILS);
        if (!emails.includes('santicape407@gmail.com')) {
            emails.push('santicape407@gmail.com');
            ss(K.EMAILS, emails);
        }
    }

    const initPromise = (async () => {
        init();
        await loadFromCloud();
    })();

    // Auth
    function login(email, pass) {
        const users = ls(K.USERS) || [];
        const u = users.find(x => x.email === email);
        if (!u) return { err: 'Correo no registrado' };
        if (!u.active) return { err: 'Cuenta desactivada' };
        if (u.pass !== pass) return { err: 'Contraseña incorrecta' };
        const emails = ls(K.EMAILS) || [];
        if (emails.length > 0 && !emails.includes(email)) return { err: 'Correo no autorizado' };
        ss(K.SESSION, { id: u.id, email: u.email, name: u.name, role: u.role });
        return { ok: true };
    }
    function getSession() { try { return JSON.parse(localStorage.getItem(K.SESSION)); } catch { return null; } }
    function logout() { localStorage.removeItem(K.SESSION); }

    // Users
    function getUsers() { return ls(K.USERS) || []; }
    function getUser(id) { return getUsers().find(u => u.id === id); }
    function addUser(d) {
        const users = getUsers();
        if (users.find(u => u.email === d.email)) return { err: 'Correo ya registrado' };
        const u = { id: uid(), email: d.email, name: d.name||'', pass: d.pass, role: d.role||'editor', active: true, at: now() };
        users.push(u); ss(K.USERS, users);
        addLog('system', 'create_user', u.email);
        pushToCloud();
        return { ok: true };
    }
    function updateUser(id, d) {
        const users = getUsers(); const i = users.findIndex(u => u.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(users[i], d); ss(K.USERS, users);
        addLog('system', 'update_user', users[i].email);
        pushToCloud();
        return { ok: true };
    }
    function deleteUser(id) {
        const users = getUsers(); const u = users.find(x => x.id === id);
        ss(K.USERS, users.filter(x => x.id !== id));
        if (u) addLog('system', 'delete_user', u.email);
        pushToCloud();
        return { ok: true };
    }

    // Roles
    function getRoles() { return ls(K.ROLES) || defaultRoles(); }
    function addRole(d) {
        const roles = getRoles();
        if (roles.find(r => r.id === d.id)) return { err: 'Ya existe' };
        roles.push({ id: d.id, name: d.name, perms: d.perms || [] });
        ss(K.ROLES, roles); pushToCloud();
        return { ok: true };
    }
    function updateRole(id, d) {
        const roles = getRoles(); const i = roles.findIndex(r => r.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(roles[i], d); ss(K.ROLES, roles); pushToCloud();
        return { ok: true };
    }
    function deleteRole(id) {
        ss(K.ROLES, getRoles().filter(r => r.id !== id)); pushToCloud();
        return { ok: true };
    }

    // Content
    function getContent(type) { return (ls(K.CONTENT) || {})[type] || []; }
    function getItem(type, id) { return getContent(type).find(x => x.id === id); }
    function addItem(type, d, user) {
        const all = ls(K.CONTENT) || defaultContent();
        if (!all[type]) all[type] = [];
        const item = { id: uid(), ...d, by: user, at: now(), up: now() };
        all[type].push(item); ss(K.CONTENT, all);
        addLog(user, 'create', `${type}: ${d.title||''}`);
        pushToCloud();
        return { ok: true, item };
    }
    function updateItem(type, id, d, user) {
        const all = ls(K.CONTENT) || defaultContent();
        const list = all[type] || [];
        const i = list.findIndex(x => x.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(list[i], d, { up: now() }); ss(K.CONTENT, all);
        addLog(user, 'update', `${type}: ${d.title||''}`);
        pushToCloud();
        return { ok: true };
    }
    function deleteItem(type, id, user) {
        const all = ls(K.CONTENT) || defaultContent();
        const list = all[type] || [];
        const item = list.find(x => x.id === id);
        all[type] = list.filter(x => x.id !== id); ss(K.CONTENT, all);
        addLog(user, 'delete', `${type}: ${item?.title||id}`);
        pushToCloud();
        return { ok: true };
    }
    function allContent() {
        const all = ls(K.CONTENT) || defaultContent();
        const r = [];
        for (const t in all) (all[t] || []).forEach(i => r.push({ ...i, _t: t }));
        return r.sort((a, b) => new Date(b.at) - new Date(a.at));
    }

    // Emails
    function getEmails() { return ls(K.EMAILS) || []; }
    function addEmail(e) {
        const emails = getEmails();
        if (emails.includes(e)) return { err: 'Ya autorizado' };
        emails.push(e); ss(K.EMAILS, emails); pushToCloud();
        return { ok: true };
    }
    function removeEmail(e) {
        ss(K.EMAILS, getEmails().filter(x => x !== e)); pushToCloud();
        return { ok: true };
    }

    function getLogs() { return ls(K.LOGS) || []; }

    return {
        initPromise, login, getSession, logout,
        getUsers, getUser, addUser, updateUser, deleteUser,
        getRoles, addRole, updateRole, deleteRole,
        getContent, getItem, addItem, updateItem, deleteItem, allContent,
        getEmails, addEmail, removeEmail, getLogs, uid
    };
})();
