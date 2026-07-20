(() => {
    let user = null;
    let curSection = 'inicio';
    let curTemporada = null;
    let tempData = {};

    // Toast
    function toast(msg, type = 'info') {
        const c = document.getElementById('toasts');
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    // Simple markdown: # -** * \n
    function formatText(text) {
        if (!text) return '';
        let html = text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/^### (.+)$/gm, '<h4>$1</h4>')
            .replace(/^## (.+)$/gm, '<h3>$1</h3>')
            .replace(/^# (.+)$/gm, '<h2>$1</h2>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/~~(.+?)~~/g, '<del>$1</del>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/^- (.+)$/gm, '• $1')
            .replace(/\n/g, '<br>');
        return html;
    }

    // Modal
    function modal(title, body, footer = '') {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = body;
        document.getElementById('modalFooter').innerHTML = footer;
        document.getElementById('modalOverlay').classList.add('active');
    }
    function closeModal() { document.getElementById('modalOverlay').classList.remove('active'); }

    // Confirm
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

    function canEdit() { return user && DB.getRoles().find(r => r.id === user.role)?.perms?.includes('create'); }
    function canDelete() { return user && DB.getRoles().find(r => r.id === user.role)?.perms?.includes('delete'); }

    // Navigation
    function nav(sec) {
        curSection = sec;
        curTemporada = null;
        document.querySelectorAll('.section').forEach(s => { s.style.display = 'none'; s.classList.remove('active'); });
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const el = document.getElementById(`sec-${sec}`);
        if (el) { el.style.display = 'block'; el.classList.add('active'); }
        const btn = document.querySelector(`.nav-btn[data-section="${sec}"]`);
        if (btn) btn.classList.add('active');
        render(sec);
        window.scrollTo(0, 0);
    }

    function showTemporada(id) {
        curTemporada = id;
        document.querySelectorAll('.section').forEach(s => { s.style.display = 'none'; s.classList.remove('active'); });
        const el = document.getElementById('sec-temporada-detail');
        el.style.display = 'block'; el.classList.add('active');
        const t = DB.getItem('temporadas', id);
        document.getElementById('temporada-title').textContent = t?.title || 'Temporada';
        renderCapitulos(id);
        window.scrollTo(0, 0);
    }

    // Render sections
    function render(sec) {
        if (sec === 'inicio') return renderInicio();
        if (sec === 'temporadas') return renderTemporadas();
        renderGeneric(sec);
    }

    function renderInicio() {
        const c = document.getElementById('content-inicio');
        const temporadas = DB.getContent('temporadas');
        const capitulos = DB.getContent('capitulos');
        const anuncios = DB.getContent('anuncios');

        if (temporadas.length === 0 && anuncios.length === 0) {
            c.innerHTML = '<div class="empty"><h3>El universo está esperando ser descubierto</h3><p>El contenido será agregado pronto.</p></div>';
            return;
        }

        let html = '<div class="inicio-layout">';

        // Columna izquierda: Temporadas expandibles
        html += '<div class="inicio-temporadas"><h2>Temporadas</h2>';
        if (temporadas.length === 0) {
            html += '<p style="color:var(--muted);">No hay temporadas aún.</p>';
        } else {
            temporadas.forEach(t => {
                const caps = capitulos.filter(c => c.temporadaId === t.id);
                html += `
                <div class="temp-card" id="temp-${t.id}">
                    <div class="temp-header" onclick="App.toggleTemp('${t.id}')">
                        <div class="temp-info">
                            <div class="temp-icon">${t.image ? `<img src="${t.image}">` : '📺'}</div>
                            <div>
                                <div class="temp-name">${t.title}</div>
                                <div class="temp-meta">${caps.length} capítulo${caps.length !== 1 ? 's' : ''}</div>
                            </div>
                        </div>
                        <span class="temp-arrow" id="arrow-${t.id}">›</span>
                    </div>
                    <div class="temp-caps" id="caps-${t.id}">
                        ${caps.length === 0 ? '<div class="temp-empty">Sin capítulos aún</div>' :
                            caps.map(c => `
                                <div class="cap-item" onclick="event.stopPropagation();App.viewCapitulo('${c.id}')">
                                    <div class="cap-num">${c.chapterNumber || '-'}</div>
                                    <div class="cap-info">
                                        <div class="cap-title">${c.title || ''}</div>
                                        <div class="cap-desc">${formatText(c.description || '')}</div>
                                    </div>
                                    ${c.image ? `<img src="${c.image}" class="cap-thumb">` : ''}
                                </div>
                            `).join('')}
                    </div>
                </div>`;
            });
        }
        html += '</div>';

        // Columna derecha: Anuncios
        html += '<div class="inicio-anuncios"><h2>Anuncios</h2>';
        if (anuncios.length === 0) {
            html += '<p style="color:var(--muted);">No hay anuncios aún.</p>';
        } else {
            anuncios.forEach(a => {
                html += `
                <div class="anuncio-card" onclick="App.view('anuncios','${a.id}')">
                    ${a.image ? `<img src="${a.image}" class="anuncio-img">` : ''}
                    <div class="anuncio-body">
                        <div class="anuncio-title">${a.title || ''}</div>
                        <div class="anuncio-date">${a.date ? new Date(a.date).toLocaleDateString('es') : ''}</div>
                        <div class="anuncio-text">${formatText(a.text || '')}</div>
                    </div>
                </div>`;
            });
        }
        html += '</div>';

        html += '</div>';
        c.innerHTML = html;
    }

    function renderTemporadas() {
        const items = DB.getContent('temporadas');
        const act = document.getElementById('actions-temporadas');
        const c = document.getElementById('content-temporadas');
        act.innerHTML = canEdit() ? '<button class="btn btn-cyan" onclick="App.addTemporada()">+ Agregar</button>' : '';
        if (items.length === 0) {
            c.innerHTML = '<div class="empty"><h3>No hay temporadas</h3><p>Las temporadas se agregarán pronto.</p></div>';
            return;
        }
        c.innerHTML = '<div class="grid">' + items.map(i => `
            <div class="card" onclick="App.viewTemporada('${i.id}')">
                <div class="card-img">${i.image ? `<img src="${i.image}">` : '📺'}</div>
                <div class="card-body">
                    <div class="card-title">${i.title}</div>
                    <div class="card-desc">${formatText(i.description || '')}</div>
                </div>
                <div class="card-footer">
                    <span>${(DB.getContent('capitulos').filter(c => c.temporadaId === i.id)).length} capítulos</span>
                    ${canEdit() ? `<div class="card-actions">
                        <button class="btn btn-gray btn-icon btn-sm" onclick="event.stopPropagation();App.editTemporada('${i.id}')" title="Editar">✏</button>
                        <button class="btn btn-red btn-icon btn-sm" onclick="event.stopPropagation();App.delTemporada('${i.id}')" title="Eliminar">🗑</button>
                    </div>` : ''}
                </div>
            </div>
        `).join('') + '</div>';
    }

    function renderCapitulos(tempId) {
        const items = DB.getContent('capitulos').filter(c => c.temporadaId === tempId);
        const act = document.getElementById('actions-capitulos');
        act.innerHTML = canEdit() ? `<button class="btn btn-cyan" onclick="App.addCapitulo('${tempId}')">+ Agregar Capítulo</button>` : '';
        const c = document.getElementById('content-capitulos');
        if (items.length === 0) {
            c.innerHTML = '<div class="empty"><h3>No hay capítulos</h3><p>Los capítulos se agregarán pronto.</p></div>';
            return;
        }
        c.innerHTML = '<div class="grid">' + items.map(i => cardHTML('capitulos', i)).join('') + '</div>';
    }

    function renderGeneric(type) {
        const items = DB.getContent(type);
        const act = document.getElementById(`actions-${type}`);
        const c = document.getElementById(`content-${type}`);
        act.innerHTML = canEdit() ? `<button class="btn btn-cyan" onclick="App.add('${type}')">+ Agregar</button>` : '';
        if (items.length === 0) {
            const icons = { personajes:'👤', comics:'💬', lore:'📜', lugares:'🗺️', anuncios:'📢' };
            const titles = { personajes:'No hay personajes', comics:'No hay comics', lore:'No hay lore', lugares:'No hay lugares', anuncios:'No hay anuncios' };
            c.innerHTML = `<div class="empty"><h3>${titles[type]}</h3><p>Se agregarán pronto.</p></div>`;
            return;
        }
        c.innerHTML = '<div class="grid">' + items.map(i => cardHTML(type, i)).join('') + '</div>';
    }

    function cardHTML(type, i) {
        const icon = { temporadas:'📺', capitulos:'📖', personajes:'👤', comics:'💬', lore:'📜', lugares:'🗺️', anuncios:'📢' };
        const roleBadge = (type === 'personajes' && i.role) ? `<div class="card-role">${i.role}</div>` : '';
        return `
        <div class="card" onclick="App.view('${type}','${i.id}')">
            <div class="card-img">${i.image ? `<img src="${i.image}">` : icon[type] || '📄'}</div>
            <div class="card-body">
                <div class="card-title">${i.title || ''}</div>
                ${roleBadge}
                <div class="card-desc">${formatText(i.description || i.text || '')}</div>
            </div>
            <div class="card-footer">
                <span>${i.at ? new Date(i.at).toLocaleDateString('es') : ''}</span>
                ${canEdit() ? `<div class="card-actions">
                    <button class="btn btn-gray btn-icon btn-sm" onclick="event.stopPropagation();App.edit('${type}','${i.id}')" title="Editar">✏</button>
                    <button class="btn btn-red btn-icon btn-sm" onclick="event.stopPropagation();App.del('${type}','${i.id}')" title="Eliminar">🗑</button>
                </div>` : ''}
            </div>
        </div>`;
    }

    // Detail modal
    function viewDetail(type, id) {
        const i = DB.getItem(type, id);
        if (!i) return;
        const titles = { temporadas:'Temporada', capitulos:'Capítulo', personajes:'Personaje', comics:'Comic', lore:'Lore', lugares:'Lugar', anuncios:'Anuncio' };
        let body = '';
        if (i.image) body += `<div style="text-align:center;margin-bottom:16px;"><img src="${i.image}" style="max-width:100%;max-height:260px;border-radius:8px;"></div>`;
        body += `<h3 style="color:#fff;margin-bottom:10px;">${i.title||''}</h3>`;
        if (type === 'personajes' && i.role) body += `<div style="display:inline-block;padding:4px 12px;background:rgba(34,211,238,0.15);color:#22d3ee;border-radius:12px;font-size:0.8rem;font-weight:600;margin-bottom:12px;">${i.role}</div>`;
        if (i.description) body += `<p style="color:#94a3b8;margin-bottom:10px;">${formatText(i.description)}</p>`;
        if (i.text) body += `<p style="color:#94a3b8;margin-bottom:10px;">${formatText(i.text)}</p>`;
        if (i.story) body += `<p style="color:#94a3b8;margin-bottom:10px;"><b style="color:#22d3ee">Historia:</b> ${formatText(i.story)}</p>`;
        if (i.chapterNumber) body += `<p style="color:#94a3b8;">Capítulo Nº: ${i.chapterNumber}</p>`;
        if (i.date) body += `<p style="color:#94a3b8;">Fecha: ${i.date}</p>`;
        if (i.pages?.length) {
            body += `<div style="margin-top:12px;"><b style="color:#22d3ee">Páginas:</b></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">`;
            i.pages.forEach(p => body += `<img src="${p}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;">`);
            body += '</div>';
        }
        const footer = canEdit() ? `
            <button class="btn btn-gray" onclick="closeModal();App.edit('${type}','${i.id}')">Editar</button>
            <button class="btn btn-red" onclick="closeModal();App.del('${type}','${i.id}')">Eliminar</button>` : '';
        modal(titles[type] || type, body, footer);
    }

    // Form HTML
    function formHTML(type, item = null) {
        const i = item || {};
        const f = {
            temporadas: `
                <div class="form-group"><label>Título</label><input id="fTitle" value="${i.title||''}"></div>
                <div class="form-group"><label>Descripción</label><textarea id="fDesc">${i.description||''}</textarea></div>
                <div class="form-group"><label>Portada</label><div class="image-upload" id="imgUp"><div class="placeholder">Subir imagen</div><input type="file" accept="image/*" id="fImg"></div></div>`,
            capitulos: `
                <div class="form-row">
                    <div class="form-group"><label>Título</label><input id="fTitle" value="${i.title||''}"></div>
                    <div class="form-group"><label>Nº Capítulo</label><input id="fNum" type="number" value="${i.chapterNumber||''}"></div>
                </div>
                <div class="form-group"><label>Descripción</label><textarea id="fDesc">${i.description||''}</textarea></div>
                <div class="form-group"><label>Portada</label><div class="image-upload" id="imgUp"><div class="placeholder">Subir imagen</div><input type="file" accept="image/*" id="fImg"></div></div>`,
            personajes: `
                <div class="form-group"><label>Nombre</label><input id="fTitle" value="${i.title||''}"></div>
                <div class="form-group"><label>Rol</label><select id="fRole">
                    <option value="">Seleccionar...</option>
                    <option value="Protagonista" ${i.role==='Protagonista'?'selected':''}>Protagonista</option>
                    <option value="Protagonista Secundario" ${i.role==='Protagonista Secundario'?'selected':''}>Protagonista Secundario</option>
                    <option value="Protagonista Terciario" ${i.role==='Protagonista Terciario'?'selected':''}>Protagonista Terciario</option>
                    <option value="Deuteragonista" ${i.role==='Deuteragonista'?'selected':''}>Deuteragonista</option>
                    <option value="Terciagonista" ${i.role==='Terciagonista'?'selected':''}>Terciagonista</option>
                    <option value="Antagonista" ${i.role==='Antagonista'?'selected':''}>Antagonista</option>
                    <option value="Antiheroe" ${i.role==='Antiheroe'?'selected':''}>Antiheroe</option>
                    <option value="Villano" ${i.role==='Villano'?'selected':''}>Villano</option>
                    <option value="Villano Secundario" ${i.role==='Villano Secundario'?'selected':''}>Villano Secundario</option>
                    <option value="Personaje Neutral" ${i.role==='Personaje Neutral'?'selected':''}>Personaje Neutral</option>
                    <option value="Mentor" ${i.role==='Mentor'?'selected':''}>Mentor</option>
                    <option value="Aliado" ${i.role==='Aliado'?'selected':''}>Aliado</option>
                    <option value="Rival" ${i.role==='Rival'?'selected':''}>Rival</option>
                    <option value="Otros" ${i.role==='Otros'?'selected':''}>Otros</option>
                </select></div>
                <div class="form-group"><label>Descripción</label><textarea id="fDesc">${i.description||''}</textarea></div>
                <div class="form-group"><label>Historia</label><textarea id="fStory">${i.story||''}</textarea></div>
                <div class="form-group"><label>Imagen</label><div class="image-upload" id="imgUp"><div class="placeholder">Subir imagen</div><input type="file" accept="image/*" id="fImg"></div></div>`,
            comics: `
                <div class="form-group"><label>Título</label><input id="fTitle" value="${i.title||''}"></div>
                <div class="form-group"><label>Descripción</label><textarea id="fDesc">${i.description||''}</textarea></div>
                <div class="form-group"><label>Portada</label><div class="image-upload" id="imgUp"><div class="placeholder">Subir imagen</div><input type="file" accept="image/*" id="fImg"></div></div>
                <div class="form-group"><label>Páginas</label><div class="image-upload" id="pagesUp"><div class="placeholder">Subir páginas</div><input type="file" accept="image/*" multiple id="fPages"></div><div id="pagesList" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"></div></div>`,
            lore: `
                <div class="form-group"><label>Título</label><input id="fTitle" value="${i.title||''}"></div>
                <div class="form-group"><label>Texto</label><textarea id="fText" style="min-height:160px">${i.text||''}</textarea></div>
                <div class="form-group"><label>Imagen</label><div class="image-upload" id="imgUp"><div class="placeholder">Subir imagen</div><input type="file" accept="image/*" id="fImg"></div></div>`,
            lugares: `
                <div class="form-group"><label>Título</label><input id="fTitle" value="${i.title||''}"></div>
                <div class="form-group"><label>Texto</label><textarea id="fText" style="min-height:160px">${i.text||''}</textarea></div>
                <div class="form-group"><label>Imagen</label><div class="image-upload" id="imgUp"><div class="placeholder">Subir imagen</div><input type="file" accept="image/*" id="fImg"></div></div>`,
            anuncios: `
                <div class="form-row">
                    <div class="form-group"><label>Título</label><input id="fTitle" value="${i.title||''}"></div>
                    <div class="form-group"><label>Fecha</label><input id="fDate" type="date" value="${i.date||new Date().toISOString().split('T')[0]}"></div>
                </div>
                <div class="form-group"><label>Texto</label><textarea id="fText">${i.text||''}</textarea></div>
                <div class="form-group"><label>Imagen</label><div class="image-upload" id="imgUp"><div class="placeholder">Subir imagen</div><input type="file" accept="image/*" id="fImg"></div></div>`
        };
        return f[type] || '';
    }

    function collectData() {
        const d = {};
        const t = document.getElementById('fTitle'); if (t) d.title = t.value.trim();
        const role = document.getElementById('fRole'); if (role) d.role = role.value;
        const desc = document.getElementById('fDesc'); if (desc) d.description = desc.value.trim();
        const txt = document.getElementById('fText'); if (txt) d.text = txt.value.trim();
        const story = document.getElementById('fStory'); if (story) d.story = story.value.trim();
        const num = document.getElementById('fNum'); if (num) d.chapterNumber = num.value;
        const date = document.getElementById('fDate'); if (date) d.date = date.value;
        if (tempData.image) d.image = tempData.image;
        if (tempData.pages?.length) d.pages = tempData.pages;
        return d;
    }

    function setupUploads() {
        tempData = { image: null, pages: [] };
        const imgUp = document.getElementById('imgUp');
        const fImg = document.getElementById('fImg');
        if (imgUp && fImg) {
            imgUp.onclick = () => fImg.click();
            fImg.onchange = e => {
                const r = new FileReader();
                r.onload = ev => {
                    tempData.image = ev.target.result;
                    imgUp.classList.add('has-image');
                    imgUp.innerHTML = `<img src="${ev.target.result}"><input type="file" accept="image/*" id="fImg">`;
                    document.getElementById('fImg').onchange = fImg.onchange;
                };
                r.readAsDataURL(e.target.files[0]);
            };
        }
        const pUp = document.getElementById('pagesUp');
        const fP = document.getElementById('fPages');
        if (pUp && fP) {
            pUp.onclick = () => fP.click();
            fP.onchange = e => {
                Array.from(e.target.files).forEach(f => {
                    const r = new FileReader();
                    r.onload = ev => {
                        tempData.pages.push(ev.target.result);
                        renderPages();
                    };
                    r.readAsDataURL(f);
                });
            };
        }
    }

    function renderPages() {
        const l = document.getElementById('pagesList');
        if (!l) return;
        l.innerHTML = tempData.pages.map((p, i) =>
            `<div style="position:relative;"><img src="${p}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;"><button onclick="App.removePage(${i})" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border:none;background:#ef4444;color:#fff;border-radius:50%;cursor:pointer;font-size:10px;">×</button></div>`
        ).join('');
    }

    function setImagePreview(imgUp, src) {
        tempData.image = src;
        imgUp.classList.add('has-image');
        imgUp.innerHTML = `<img src="${src}"><input type="file" accept="image/*" id="fImg">`;
        document.getElementById('fImg').onchange = function(e) {
            const r = new FileReader();
            r.onload = ev => { tempData.image = ev.target.result; setImagePreview(imgUp, ev.target.result); };
            r.readAsDataURL(e.target.files[0]);
        };
    }

    window.App = {
        init() {
            user = DB.getSession();
            document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => nav(b.dataset.section)));
            document.getElementById('adminBtn').onclick = () => location.href = 'admin.html';
            document.getElementById('menuToggle').onclick = () => document.getElementById('nav').classList.toggle('open');
            document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => document.getElementById('nav').classList.remove('open')));
            document.getElementById('modalClose').onclick = closeModal;
            document.getElementById('modalOverlay').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
            document.getElementById('confirmCancel').onclick = () => document.getElementById('confirmOverlay').classList.remove('active');
            nav('inicio');

            // Tiempo real: cuando Firestore actualiza, re-renderizar la sección actual
            DB.onUpdate((type) => {
                nav(type);
            });
        },

        _refresh(type, extra) {
            if (type === 'capitulos' && extra) {
                renderCapitulos(extra);
            } else {
                nav(type);
            }
        },

        add(type, tempId) {
            if (type === 'capitulos' && tempId) {
                modal('Agregar Capítulo', formHTML('capitulos'), `
                    <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
                    <button class="btn btn-cyan" onclick="App.save('capitulos','${tempId}')">Guardar</button>`);
            } else {
                modal(`Agregar ${type}`, formHTML(type), `
                    <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
                    <button class="btn btn-cyan" onclick="App.save('${type}')">Guardar</button>`);
            }
            setTimeout(setupUploads, 30);
        },

        save(type, tempId) {
            const d = collectData();
            if (!d.title) { toast('El título es requerido', 'error'); return; }
            if (type === 'capitulos' && tempId) d.temporadaId = tempId;
            DB.addItem(type, d, user?.email || 'anon');
            toast('Guardado', 'success'); closeModal();
            this._refresh(type, type === 'capitulos' ? (tempId || d.temporadaId) : null);
        },

        edit(type, id) {
            const i = DB.getItem(type, id);
            if (type === 'capitulos') {
                modal('Editar Capítulo', formHTML('capitulos', i), `
                    <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
                    <button class="btn btn-cyan" onclick="App.update('capitulos','${id}')">Actualizar</button>`);
            } else {
                modal(`Editar ${type}`, formHTML(type, i), `
                    <button class="btn btn-gray" onclick="closeModal()">Cancelar</button>
                    <button class="btn btn-cyan" onclick="App.update('${type}','${id}')">Actualizar</button>`);
            }
            setTimeout(() => {
                setupUploads();
                if (i.image) setImagePreview(document.getElementById('imgUp'), i.image);
                if (i.pages?.length) { tempData.pages = [...i.pages]; renderPages(); }
            }, 30);
        },

        update(type, id) {
            const d = collectData();
            if (type === 'capitulos') {
                const existing = DB.getItem('capitulos', id);
                d.temporadaId = existing?.temporadaId;
            }
            DB.updateItem(type, id, d, user?.email || 'anon');
            toast('Actualizado', 'success'); closeModal();
            this._refresh(type, type === 'capitulos' ? DB.getItem('capitulos', id)?.temporadaId : null);
        },

        del(type, id) {
            confirm('¿Eliminar?', 'No se puede deshacer.', () => {
                let tempId = null;
                if (type === 'capitulos') {
                    const existing = DB.getItem('capitulos', id);
                    tempId = existing?.temporadaId;
                }
                DB.deleteItem(type, id, user?.email || 'anon');
                toast('Eliminado', 'success');
                this._refresh(type, tempId);
            });
        },

        view(type, id) { viewDetail(type, id); },
        removePage(i) { tempData.pages.splice(i, 1); renderPages(); },

        toggleTemp(id) {
            const el = document.getElementById(`caps-${id}`);
            const arrow = document.getElementById(`arrow-${id}`);
            if (!el) return;
            const isOpen = el.classList.contains('open');
            document.querySelectorAll('.temp-caps.open').forEach(c => c.classList.remove('open'));
            document.querySelectorAll('.temp-arrow.open').forEach(a => a.classList.remove('open'));
            if (!isOpen) {
                el.classList.add('open');
                arrow.classList.add('open');
            }
        },

        viewCapitulo(id) {
            const c = DB.getItem('capitulos', id);
            if (!c) return;
            let body = '';
            if (c.image) body += `<div style="text-align:center;margin-bottom:16px;"><img src="${c.image}" style="max-width:100%;max-height:260px;border-radius:8px;"></div>`;
            body += `<h3 style="color:#fff;margin-bottom:6px;">${c.title||''}</h3>`;
            if (c.chapterNumber) body += `<p style="color:var(--cyan);font-size:0.85rem;margin-bottom:10px;">Capítulo ${c.chapterNumber}</p>`;
            if (c.description) body += `<p style="color:#94a3b8;">${formatText(c.description)}</p>`;
            modal('Capítulo', body);
        },

        addTemporada() { this.add('temporadas'); },
        saveTemporada() { this.save('temporadas'); },
        editTemporada(id) { this.edit('temporadas', id); },
        updateTemporada(id) { this.update('temporadas', id); },
        delTemporada(id) {
            confirm('¿Eliminar temporada?', 'Se eliminarán también sus capítulos.', () => {
                DB.getContent('capitulos').filter(c => c.temporadaId === id).forEach(c => DB.deleteItem('capitulos', c.id, user?.email || 'anon'));
                DB.deleteItem('temporadas', id, user?.email || 'anon');
                toast('Eliminada', 'success'); nav('temporadas');
            });
        },
        viewTemporada(id) { showTemporada(id); },
        addCapitulo(tempId) { this.add('capitulos', tempId); }
    };

    document.addEventListener('DOMContentLoaded', () => App.init());
    window.closeModal = closeModal;
})();
