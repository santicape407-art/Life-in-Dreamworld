(() => {
    let user = null;
    let curPanel = 'users';
    let curFilter = 'all';

    function toast(msg, type = 'info') {
        const c = document.getElementById('toasts');
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    function modal(title, body, footer = '') {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = body;
        document.getElementById('modalFooter').innerHTML = footer;
        document.getElementById('modalOverlay').classList.add('active');
    }

    function closeModal() { document.getElementById('modalOverlay').classList.remove('active'); }

    function confirm(title, msg, onOk) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = msg;
        document.getElementById('confirmOverlay').classList.add('active');
        const a = document.getElementById('confirmAccept');
        const b = document.getElementById('confirmCancel');
        const na = a.cloneNode(true), nb = b.cloneNode(true);
        a.replaceWith(na); b.replaceWith(nb);
        na.addEventListener('click', () => { document.getElementById('confirmOverlay').classList.remove('active'); onOk(); });
        nb.addEventListener('click', () => { document.getElementById('confirmOverlay').classList.remove('active'); });
    }

    function fmt(iso) { return iso ? new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '-'; }

    function showAdmin() {
        document.getElementById('loginWrap').style.display = 'none';
        document.getElementById('adminLayout').style.display = 'flex';
        document.getElementById('adminUser').style.display = 'flex';
        document.getElementById('adminUserName').textContent = user.email;
        renderPanel();
    }

    function renderPanel() {
        switch (curPanel) {
            case 'users': renderUsers(); break;
            case 'roles': renderRoles(); break;
            case 'content': renderContent(); break;
            case 'logs': renderLogs(); break;
        }
    }

    function switchPanel(p) {
        curPanel = p;
        document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.toggle('active', b.dataset.panel === p));
        document.querySelectorAll('.panel').forEach(el => el.classList.toggle('active', el.id === `p-${p}`));
        renderPanel();
    }

    // Users
    function renderUsers() {
        const users = DB.getUsers();
        const tb = document.getElementById('usersBody');
        tb.innerHTML = users.map(u => `<tr>
            <td>${u.email}</td><td>${u.name||'-'}</td>
            <td><span class="badge badge-${u.role}">${u.role}</span></td>
            <td><span class="badge ${u.active?'badge-active':'badge-inactive'}">${u.active?'Activo':'Inactivo'}</span></td>
            <td><div style="display:flex;gap:4px;">
                <button class="btn btn-gray btn-icon btn-sm" onclick="AP.editUser('${u.id}')" title="Editar">✏</button>
                ${u.id!=='admin_main'?`<button class="btn btn-red btn-icon btn-sm" onclick="AP.delUser('${u.id}')" title="Eliminar">🗑</button>`:''}
                <button class="btn btn-gray btn-icon btn-sm" onclick="AP.toggleUser('${u.id}')" title="${u.active?'Desactivar':'Activar'}">${u.active?'🔒':'🔓'}</button>
            </div></td>
        </tr>`).join('');
    }

    function userForm(u = null) {
        return `
            <div class="form-group"><label>Correo</label><input id="uEmail" value="${u?.email||''}" ${u?'readonly style="opacity:0.6"':''}></div>
            <div class="form-group"><label>Nombre</label><input id="uName" value="${u?.name||''}"></div>
            <div class="form-group"><label>Contraseña ${u?'(vacío = mantener)':''}</label><input type="password" id="uPass"></div>
            <div class="form-row">
                <div class="form-group"><label>Rol</label><select id="uRole">${DB.getRoles().map(r=>`<option value="${r.id}" ${u?.role===r.id?'selected':''}>${r.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>Activo</label><select id="uActive"><option value="true" ${u?.active!==false?'selected':''}>Sí</option><option value="false" ${u?.active===false?'selected':''}>No</option></select></div>
            </div>`;
    }

    // Roles
    function renderRoles() {
        const roles = DB.getRoles();
        const tb = document.getElementById('rolesBody');
        tb.innerHTML = roles.map(r => `<tr>
            <td>${r.id}</td><td>${r.name}</td>
            <td>${r.perms.map(p=>`<span class="badge badge-editor" style="margin:1px;">${p}</span>`).join(' ')}</td>
            <td><div style="display:flex;gap:4px;">
                <button class="btn btn-gray btn-icon btn-sm" onclick="AP.editRole('${r.id}')" title="Editar">✏</button>
                ${r.id!=='admin'?`<button class="btn btn-red btn-icon btn-sm" onclick="AP.delRole('${r.id}')" title="Eliminar">🗑</button>`:''}
            </div></td>
        </tr>`).join('');
    }

    function roleForm(r = null) {
        const all = ['create','read','update','delete','manage'];
        return `
            <div class="form-group"><label>ID</label><input id="rId" value="${r?.id||''}" ${r?'readonly style="opacity:0.6"':''}></div>
            <div class="form-group"><label>Nombre</label><input id="rName" value="${r?.name||''}"></div>
            <div class="form-group"><label>Permisos</label><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
                ${all.map(p=>`<label style="display:flex;align-items:center;gap:4px;padding:4px 10px;background:var(--card);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:0.8rem;"><input type="checkbox" value="${p}" class="rPerm" ${r?.perms?.includes(p)?'checked':''}>${p}</label>`).join('')}
            </div></div>`;
    }

    // Content
    function renderContent() {
        let items = DB.allContent();
        if (curFilter !== 'all') items = items.filter(i => i._t === curFilter);
        const labels = { temporadas:'Temporada', capitulos:'Capítulo', personajes:'Personaje', comics:'Comic', lore:'Lore', lugares:'Lugar', anuncios:'Anuncio' };
        const tb = document.getElementById('contentBody');
        if (!items.length) { tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--muted);">Sin contenido</td></tr>'; return; }
        tb.innerHTML = items.map(i => `<tr>
            <td><span class="badge badge-editor">${labels[i._t]||i._t}</span></td>
            <td>${i.title||'Sin título'}</td>
            <td>${fmt(i.at)}</td>
            <td><div style="display:flex;gap:4px;">
                <button class="btn btn-gray btn-icon btn-sm" onclick="window.location.href='index.html?view=${i._t}&id=${i.id}'" title="Ver">👁</button>
                <button class="btn btn-red btn-icon btn-sm" onclick="AP.delContent('${i._t}','${i.id}')" title="Eliminar">🗑</button>
            </div></td>
        </tr>`).join('');
    }

    // Logs
    function renderLogs() {
        const logs = DB.getLogs();
        const labels = { create:'Crear', update:'Actualizar', delete:'Eliminar', create_user:'Crear usuario', update_user:'Actualizar usuario', delete_user:'Eliminar usuario' };
        const tb = document.getElementById('logsBody');
        if (!logs.length) { tb.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--muted);">Sin registros</td></tr>'; return; }
        tb.innerHTML = logs.slice(0, 100).map(l => `<tr>
            <td>${fmt(l.at)}</td><td>${l.user}</td>
            <td><span class="badge badge-info">${labels[l.action]||l.action}</span></td>
            <td>${l.detail||'-'}</td>
        </tr>`).join('');
    }

    window.AP = {
        init() {
            user = DB.getSession();
            if (user) showAdmin();

            document.getElementById('loginForm').addEventListener('submit', async e => {
                e.preventDefault();
                const email = document.getElementById('loginEmail').value.trim();
                const pass = document.getElementById('loginPass').value;
                const err = document.getElementById('loginError');
                err.style.display = 'none';
                const r = await DB.login(email, pass);
                if (r.err) { err.textContent = r.err; err.style.display = 'block'; return; }
                user = DB.getSession();
                showAdmin();
            });

            document.getElementById('logoutBtn').onclick = async () => {
                await DB.logout(); user = null;
                document.getElementById('loginWrap').style.display = 'flex';
                document.getElementById('adminLayout').style.display = 'none';
                document.getElementById('adminUser').style.display = 'none';
            };

            document.querySelectorAll('.sidebar-btn').forEach(b => b.addEventListener('click', () => switchPanel(b.dataset.panel)));

            // Tiempo real: cuando Firestore actualiza, re-renderizar
            DB.onUpdate(() => {
                if (user) renderContent();
            });

            document.getElementById('contentFilters')?.addEventListener('click', e => {
                if (!e.target.classList.contains('filter-btn')) return;
                curFilter = e.target.dataset.f;
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.f === curFilter));
                renderContent();
            });

            document.getElementById('addUserBtn').onclick = () => {
                modal('Agregar Usuario', userForm(), `
                    <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
                    <button class="btn btn-cyan" onclick="AP.saveUser()">Crear</button>`);
            };

            document.getElementById('addRoleBtn').onclick = () => {
                modal('Agregar Rol', roleForm(), `
                    <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
                    <button class="btn btn-cyan" onclick="AP.saveRole()">Crear</button>`);
            };

            document.getElementById('modalClose').onclick = closeModal;
            document.getElementById('modalOverlay').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
            document.getElementById('confirmCancel').onclick = () => document.getElementById('confirmOverlay').classList.remove('active');
        },

        editUser(id) {
            const u = DB.getUser(id);
            modal('Editar Usuario', userForm(u), `
                <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
                <button class="btn btn-cyan" onclick="AP.updateUser('${id}')">Actualizar</button>`);
        },
        async saveUser() {
            const email = document.getElementById('uEmail').value.trim();
            const name = document.getElementById('uName').value.trim();
            const pass = document.getElementById('uPass').value;
            const role = document.getElementById('uRole').value;
            const active = document.getElementById('uActive').value === 'true';
            if (!email || !pass) { toast('Correo y contraseña requeridos', 'error'); return; }
            const r = await DB.addUser({ email, name, pass, role, active });
            if (r.err) { toast(r.err, 'error'); return; }
            toast(`Usuario creado. Login: ${email} / ${pass}`, 'success'); closeModal(); renderUsers();
        },
        updateUser(id) {
            const d = { name: document.getElementById('uName').value.trim(), role: document.getElementById('uRole').value, active: document.getElementById('uActive').value === 'true' };
            const pass = document.getElementById('uPass').value;
            if (pass) d.pass = pass;
            DB.updateUser(id, d);
            toast('Actualizado', 'success'); closeModal(); renderUsers();
        },
        delUser(id) {
            confirm('¿Eliminar usuario?', 'No se puede deshacer.', () => {
                DB.deleteUser(id); toast('Eliminado', 'success'); renderUsers();
            });
        },
        toggleUser(id) {
            const u = DB.getUser(id);
            DB.updateUser(id, { active: !u.active });
            toast(u.active ? 'Desactivado' : 'Activado', 'success'); renderUsers();
        },

        editRole(id) {
            const r = DB.getRoles().find(x => x.id === id);
            modal('Editar Rol', roleForm(r), `
                <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
                <button class="btn btn-cyan" onclick="AP.updateRole('${id}')">Actualizar</button>`);
        },
        saveRole() {
            const id = document.getElementById('rId').value.trim();
            const name = document.getElementById('rName').value.trim();
            const perms = [...document.querySelectorAll('.rPerm:checked')].map(c => c.value);
            if (!id || !name) { toast('ID y nombre requeridos', 'error'); return; }
            const r = DB.addRole({ id, name, perms });
            if (r.err) { toast(r.err, 'error'); return; }
            toast('Rol creado', 'success'); closeModal(); renderRoles();
        },
        updateRole(id) {
            const name = document.getElementById('rName').value.trim();
            const perms = [...document.querySelectorAll('.rPerm:checked')].map(c => c.value);
            DB.updateRole(id, { name, perms });
            toast('Actualizado', 'success'); closeModal(); renderRoles();
        },
        delRole(id) {
            confirm('¿Eliminar rol?', 'No se puede deshacer.', () => {
                DB.deleteRole(id); toast('Eliminado', 'success'); renderRoles();
            });
        },

        delContent(type, id) {
            confirm('¿Eliminar?', 'No se puede deshacer.', () => {
                DB.deleteItem(type, id, user?.email || 'anon');
                toast('Eliminado', 'success'); renderContent();
            });
        }
    };

    document.addEventListener('DOMContentLoaded', () => AP.init());
    window.closeModal = closeModal;
})();
