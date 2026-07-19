const DB = (() => {
    const K = { USERS: 'lid_u', ROLES: 'lid_r', CONTENT: 'lid_c', LOGS: 'lid_l', SESSION: 'lid_s', EMAILS: 'lid_e' };

    function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }
    function get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
    function set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
    function now() { return new Date().toISOString(); }

    function log(user, action, detail) {
        const logs = get(K.LOGS) || [];
        logs.unshift({ id: uid(), user, action, detail, at: now() });
        if (logs.length > 300) logs.length = 300;
        set(K.LOGS, logs);
    }

    function init() {
        // Roles
        if (!get(K.ROLES)) set(K.ROLES, [
            { id: 'admin', name: 'Administrador', perms: ['create','read','update','delete','manage'] },
            { id: 'mod', name: 'Moderador', perms: ['create','read','update','delete'] },
            { id: 'editor', name: 'Editor', perms: ['create','read','update'] }
        ]);

        // Users - siempre asegurar que exista el admin
        const users = get(K.USERS) || [];
        if (!users.find(u => u.email === 'santicape407@gmail.com')) {
            users.push({
                id: 'admin_main', email: 'santicape407@gmail.com',
                name: 'Administrador', pass: 'Sonicelde2011',
                role: 'admin', active: true, at: now()
            });
            set(K.USERS, users);
        }

        // Emails autorizados
        const emails = get(K.EMAILS) || [];
        if (!emails.includes('santicape407@gmail.com')) {
            emails.push('santicape407@gmail.com');
            set(K.EMAILS, emails);
        }

        // Content
        if (!get(K.CONTENT)) set(K.CONTENT, { temporadas: [], personajes: [], comics: [], lore: [], lugares: [], anuncios: [] });

        // Logs
        if (!get(K.LOGS)) set(K.LOGS, []);
    }

    // Auth
    function login(email, pass) {
        const users = get(K.USERS) || [];
        const u = users.find(x => x.email === email);
        if (!u) return { err: 'Correo no registrado' };
        if (!u.active) return { err: 'Cuenta desactivada' };
        if (u.pass !== pass) return { err: 'Contraseña incorrecta' };
        const emails = get(K.EMAILS) || [];
        if (emails.length > 0 && !emails.includes(email)) return { err: 'Correo no autorizado' };
        set(K.SESSION, { id: u.id, email: u.email, name: u.name, role: u.role });
        return { ok: true };
    }

    function getSession() { return get(K.SESSION); }
    function logout() { localStorage.removeItem(K.SESSION); }

    // Users CRUD
    function getUsers() { return get(K.USERS) || []; }
    function getUser(id) { return getUsers().find(u => u.id === id); }
    function addUser(d) {
        const users = getUsers();
        if (users.find(u => u.email === d.email)) return { err: 'Correo ya registrado' };
        const u = { id: uid(), email: d.email, name: d.name||'', pass: d.pass, role: d.role||'editor', active: true, at: now() };
        users.push(u); set(K.USERS, users); log('system', 'create_user', u.email);
        return { ok: true };
    }
    function updateUser(id, d) {
        const users = getUsers(); const i = users.findIndex(u => u.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(users[i], d); set(K.USERS, users); log('system', 'update_user', users[i].email);
        return { ok: true };
    }
    function deleteUser(id) {
        const users = getUsers(); const u = users.find(x => x.id === id);
        set(K.USERS, users.filter(x => x.id !== id));
        if (u) log('system', 'delete_user', u.email);
        return { ok: true };
    }

    // Roles CRUD
    function getRoles() { return get(K.ROLES) || []; }
    function addRole(d) {
        const roles = getRoles();
        if (roles.find(r => r.id === d.id)) return { err: 'Ya existe' };
        roles.push({ id: d.id, name: d.name, perms: d.perms || [] });
        set(K.ROLES, roles); return { ok: true };
    }
    function updateRole(id, d) {
        const roles = getRoles(); const i = roles.findIndex(r => r.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(roles[i], d); set(K.ROLES, roles); return { ok: true };
    }
    function deleteRole(id) {
        set(K.ROLES, getRoles().filter(r => r.id !== id)); return { ok: true };
    }

    // Content CRUD
    function getContent(type) { return (get(K.CONTENT) || {})[type] || []; }
    function getItem(type, id) { return getContent(type).find(x => x.id === id); }
    function addItem(type, d, user) {
        const all = get(K.CONTENT) || {};
        if (!all[type]) all[type] = [];
        const item = { id: uid(), ...d, by: user, at: now(), up: now() };
        all[type].push(item); set(K.CONTENT, all);
        log(user, 'create', `${type}: ${d.title||''}`);
        return { ok: true, item };
    }
    function updateItem(type, id, d, user) {
        const all = get(K.CONTENT) || {};
        const i = (all[type]||[]).findIndex(x => x.id === id);
        if (i < 0) return { err: 'No encontrado' };
        Object.assign(all[type][i], d, { up: now() }); set(K.CONTENT, all);
        log(user, 'update', `${type}: ${d.title||''}`);
        return { ok: true };
    }
    function deleteItem(type, id, user) {
        const all = get(K.CONTENT) || {};
        const item = (all[type]||[]).find(x => x.id === id);
        all[type] = (all[type]||[]).filter(x => x.id !== id);
        set(K.CONTENT, all);
        log(user, 'delete', `${type}: ${item?.title||id}`);
        return { ok: true };
    }
    function allContent() {
        const all = get(K.CONTENT) || {};
        const r = [];
        for (const t in all) all[t].forEach(i => r.push({ ...i, _t: t }));
        return r.sort((a, b) => new Date(b.at) - new Date(a.at));
    }

    // Emails
    function getEmails() { return get(K.EMAILS) || []; }
    function addEmail(e) { const l = getEmails(); if (l.includes(e)) return { err: 'Ya autorizado' }; l.push(e); set(K.EMAILS, l); return { ok: true }; }
    function removeEmail(e) { set(K.EMAILS, getEmails().filter(x => x !== e)); return { ok: true }; }

    // Logs
    function getLogs() { return get(K.LOGS) || []; }

    init();

    return {
        login, getSession, logout,
        getUsers, getUser, addUser, updateUser, deleteUser,
        getRoles, addRole, updateRole, deleteRole,
        getContent, getItem, addItem, updateItem, deleteItem, allContent,
        getEmails, addEmail, removeEmail, getLogs, uid
    };
})();
