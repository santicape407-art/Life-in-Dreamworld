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

    function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }
    function now() { return new Date().toISOString(); }

    // Cache local para lecturas síncronas
    let cache = { users: null, roles: null, content: null, logs: null, emails: null };
    let ready = false;

    // Cargar todo desde Firestore al iniciar
    async function loadAll() {
        const [usersSnap, rolesSnap, contentSnap, logsSnap, emailsSnap] = await Promise.all([
            db.collection('data').doc('users').get(),
            db.collection('data').doc('roles').get(),
            db.collection('data').doc('content').get(),
            db.collection('data').doc('logs').get(),
            db.collection('data').doc('emails').get()
        ]);
        cache.users = usersSnap.exists ? usersSnap.data().list : [];
        cache.roles = rolesSnap.exists ? rolesSnap.data().list : defaultRoles();
        cache.content = contentSnap.exists ? contentSnap.data() : defaultContent();
        cache.logs = logsSnap.exists ? logsSnap.data().list : [];
        cache.emails = emailsSnap.exists ? emailsSnap.data().list : [];

        // Asegurar admin
        if (!cache.users.find(u => u.email === 'santicape407@gmail.com')) {
            cache.users.push({
                id: 'admin_main', email: 'santicape407@gmail.com',
                name: 'Administrador', pass: 'Sonicelde2011',
                role: 'admin', active: true, at: now()
            });
            await saveUsers();
        }
        if (!cache.emails.includes('santicape407@gmail.com')) {
            cache.emails.push('santicape407@gmail.com');
            await saveEmails();
        }

        ready = true;
    }

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

    // Guardar en Firestore
    async function saveUsers() { await db.collection('data').doc('users').set({ list: cache.users }); }
    async function saveRoles() { await db.collection('data').doc('roles').set({ list: cache.roles }); }
    async function saveContent() { await db.collection('data').doc('content').set(cache.content); }
    async function saveLogs() { await db.collection('data').doc('logs').set({ list: cache.logs.slice(0, 300) }); }
    async function saveEmails() { await db.collection('data').doc('emails').set({ list: cache.emails }); }

    function log(user, action, detail) {
        cache.logs.unshift({ id: uid(), user, action, detail, at: now() });
        if (cache.logs.length > 300) cache.logs.length = 300;
        saveLogs();
    }

    // Auth
    function login(email, pass) {
        const u = cache.users.find(x => x.email === email);
        if (!u) return { err: 'Correo no registrado' };
        if (!u.active) return { err: 'Cuenta desactivada' };
        if (u.pass !== pass) return { err: 'Contraseña incorrecta' };
        if (cache.emails.length > 0 && !cache.emails.includes(email)) return { err: 'Correo no autorizado' };
        const session = { id: u.id, email: u.email, name: u.name, role: u.role };
        localStorage.setItem('lid_s', JSON.stringify(session));
        return { ok: true };
    }

    function getSession() {
        try { return JSON.parse(localStorage.getItem('lid_s')); } catch { return null; }
    }
    function logout() { localStorage.removeItem('lid_s'); }

    // Users
    function getUsers() { return cache.users || []; }
    function getUser(id) { return (cache.users || []).find(u => u.id === id); }
    async function addUser(d) {
        if (cache.users.find(u => u.email === d.email)) return { err: 'Correo ya registrado' };
        const u = { id: uid(), email: d.email, name: d.name||'', pass: d.pass, role: d.role||'editor', active: true, at: now() };
        cache.users.push(u);
        await saveUsers();
        log('system', 'create_user', u.email);
        return { ok: true };
    }
    async function updateUser(id, d) {
        const i = cache.users.findIndex(u => u.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(cache.users[i], d);
        await saveUsers();
        log('system', 'update_user', cache.users[i].email);
        return { ok: true };
    }
    async function deleteUser(id) {
        const u = cache.users.find(x => x.id === id);
        cache.users = cache.users.filter(x => x.id !== id);
        await saveUsers();
        if (u) log('system', 'delete_user', u.email);
        return { ok: true };
    }

    // Roles
    function getRoles() { return cache.roles || []; }
    async function addRole(d) {
        if (cache.roles.find(r => r.id === d.id)) return { err: 'Ya existe' };
        cache.roles.push({ id: d.id, name: d.name, perms: d.perms || [] });
        await saveRoles();
        return { ok: true };
    }
    async function updateRole(id, d) {
        const i = cache.roles.findIndex(r => r.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(cache.roles[i], d);
        await saveRoles();
        return { ok: true };
    }
    async function deleteRole(id) {
        cache.roles = cache.roles.filter(r => r.id !== id);
        await saveRoles();
        return { ok: true };
    }

    // Content
    function getContent(type) { return (cache.content || {})[type] || []; }
    function getItem(type, id) { return (cache.content[type] || []).find(x => x.id === id); }
    async function addItem(type, d, user) {
        if (!cache.content[type]) cache.content[type] = [];
        const item = { id: uid(), ...d, by: user, at: now(), up: now() };
        cache.content[type].push(item);
        await saveContent();
        log(user, 'create', `${type}: ${d.title||''}`);
        return { ok: true, item };
    }
    async function updateItem(type, id, d, user) {
        const list = cache.content[type] || [];
        const i = list.findIndex(x => x.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(list[i], d, { up: now() });
        await saveContent();
        log(user, 'update', `${type}: ${d.title||''}`);
        return { ok: true };
    }
    async function deleteItem(type, id, user) {
        const list = cache.content[type] || [];
        const item = list.find(x => x.id === id);
        cache.content[type] = list.filter(x => x.id !== id);
        await saveContent();
        log(user, 'delete', `${type}: ${item?.title||id}`);
        return { ok: true };
    }
    function allContent() {
        const r = [];
        for (const t in cache.content) (cache.content[t] || []).forEach(i => r.push({ ...i, _t: t }));
        return r.sort((a, b) => new Date(b.at) - new Date(a.at));
    }

    // Emails
    function getEmails() { return cache.emails || []; }
    async function addEmail(e) {
        if (cache.emails.includes(e)) return { err: 'Ya autorizado' };
        cache.emails.push(e);
        await saveEmails();
        return { ok: true };
    }
    async function removeEmail(e) {
        cache.emails = cache.emails.filter(x => x !== e);
        await saveEmails();
        return { ok: true };
    }

    // Logs
    function getLogs() { return cache.logs || []; }

    // Inicializar
    const initPromise = loadAll().catch(e => {
        console.error('Firebase init error:', e);
        // Fallback: usar datos por defecto
        cache.users = [{ id: 'admin_main', email: 'santicape407@gmail.com', name: 'Administrador', pass: 'Sonicelde2011', role: 'admin', active: true, at: now() }];
        cache.roles = defaultRoles();
        cache.content = defaultContent();
        cache.logs = [];
        cache.emails = ['santicape407@gmail.com'];
        ready = true;
    });

    return {
        ready: () => ready,
        initPromise,
        login, getSession, logout,
        getUsers, getUser, addUser, updateUser, deleteUser,
        getRoles, addRole, updateRole, deleteRole,
        getContent, getItem, addItem, updateItem, deleteItem, allContent,
        getEmails, addEmail, removeEmail, getLogs, uid
    };
})();
