
// --- MOTOR SQL SIMULADO ---
class Database {
    private tables: Record<string, any[]> = {};

    constructor() {
        this.load();
    }

    private load() {
        this.tables.users = JSON.parse(localStorage.getItem('db_users') || '[]');
        this.tables.cities = JSON.parse(localStorage.getItem('db_cities') || '[]');
        this.tables.categories = JSON.parse(localStorage.getItem('db_categories') || '["Arroz", "Feijão", "Carnes", "Laticínios"]');
    }

    private save() {
        localStorage.setItem('db_users', JSON.stringify(this.tables.users));
        localStorage.setItem('db_cities', JSON.stringify(this.tables.cities));
    }

    // SELECT * FROM table WHERE condition
    query(sql: string, params: any[] = []): any[] {
        const parts = sql.trim().toUpperCase().split(' ');
        const table = parts[parts.indexOf('FROM') + 1].toLowerCase();

        if (parts[0] === 'SELECT') {
            return [...this.tables[table]];
        }

        if (parts[0] === 'INSERT') {
            const data = params[0];
            data.id = Date.now();
            this.tables[table].push(data);
            this.save();
            return [data];
        }

        if (parts[0] === 'DELETE') {
            const id = params[0];
            this.tables[table] = this.tables[table].filter(row => row.id !== id && row.name !== id);
            this.save();
            return [];
        }

        return [];
    }
}

const db = new Database();

// --- ESTADO DA APP ---
let currentUser: any = null;
let authMode: 'login' | 'register' = 'login';

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    initAdmin();
    checkSession();
});

function initAdmin() {
    const adminExists = db.query('SELECT * FROM users').find(u => u.name === 'administrador');
    if (!adminExists) {
        db.query('INSERT INTO users', [{
            name: 'administrador',
            password: 'Mu@300413',
            email: 'admin@supercompare.com',
            city: 'Sistema',
            createdAt: new Date().toISOString()
        }]);
    }
    
    // Cidades iniciais
    if (db.query('SELECT * FROM cities').length === 0) {
        db.query('INSERT INTO cities', [{ name: 'São Paulo', state: 'SP' }]);
        db.query('INSERT INTO cities', [{ name: 'Rio de Janeiro', state: 'RJ' }]);
    }
}

function checkSession() {
    const session = localStorage.getItem('app_session');
    if (session) {
        currentUser = JSON.parse(session);
        renderApp();
    }
}

// --- AUTH LÓGICA ---
const setAuthMode = (mode: 'login' | 'register') => {
    authMode = mode;
    const btnLogin = document.getElementById('btn-tab-login');
    const btnRegister = document.getElementById('btn-tab-register');
    const registerFields = document.getElementById('register-fields');
    const btnSubmit = document.getElementById('btn-auth-submit');

    if (btnLogin) btnLogin.className = mode === 'login' ? 'flex-1 py-2 text-xs font-black uppercase rounded-lg bg-white shadow-sm text-emerald-600' : 'flex-1 py-2 text-xs font-black uppercase rounded-lg text-gray-400';
    if (btnRegister) btnRegister.className = mode === 'register' ? 'flex-1 py-2 text-xs font-black uppercase rounded-lg bg-white shadow-sm text-emerald-600' : 'flex-1 py-2 text-xs font-black uppercase rounded-lg text-gray-400';
    
    if (registerFields) registerFields.classList.toggle('hidden', mode === 'login');
    if (btnSubmit) btnSubmit.textContent = mode === 'login' ? 'Acessar Sistema' : 'Confirmar Cadastro';
    
    if (mode === 'register') populateCitiesSelect('auth-city');
};
(window as any).setAuthMode = setAuthMode;

const authForm = document.getElementById('form-auth');
if (authForm) {
    authForm.onsubmit = (e) => {
        e.preventDefault();
        const userInp = (document.getElementById('auth-username') as HTMLInputElement).value.trim();
        const passInp = (document.getElementById('auth-password') as HTMLInputElement).value;
        const errorEl = document.getElementById('auth-error');

        if (authMode === 'register') {
            const emailInp = (document.getElementById('auth-email') as HTMLInputElement).value;
            const cityInp = (document.getElementById('auth-city') as HTMLSelectElement).value;

            if (!cityInp) {
                if (errorEl) { errorEl.textContent = 'Selecione uma cidade'; errorEl.classList.remove('hidden'); }
                return;
            }

            db.query('INSERT INTO users', [{
                name: userInp,
                email: emailInp,
                city: cityInp,
                password: passInp,
                createdAt: new Date().toISOString()
            }]);
            
            showToast('Cadastro realizado!');
            setAuthMode('login');
        } else {
            const user = db.query('SELECT * FROM users').find(u => u.name === userInp && u.password === passInp);
            if (user) {
                currentUser = user;
                localStorage.setItem('app_session', JSON.stringify(user));
                renderApp();
            } else {
                if (errorEl) { errorEl.textContent = 'Usuário ou senha incorretos'; errorEl.classList.remove('hidden'); }
            }
        }
    };
}

// --- NAVEGAÇÃO E VIEWS ---
const showView = (viewId: string) => {
    document.querySelectorAll('#main-app main > div').forEach(div => div.classList.add('hidden'));
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.classList.remove('hidden');
        if (viewId === 'admin-users') renderAdminUsers();
        if (viewId === 'admin-cities') renderAdminCities();
        if (viewId === 'home') renderShoppingDropdowns();
    }
};
(window as any).showView = showView;

function renderApp() {
    document.getElementById('auth-section')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.remove('hidden');
    
    const headerName = document.getElementById('header-user-name');
    const headerCity = document.getElementById('header-user-city');
    const navAdmin = document.getElementById('nav-admin');

    if (headerName) headerName.textContent = currentUser.name;
    if (headerCity) headerCity.textContent = currentUser.city;
    if (navAdmin) navAdmin.classList.toggle('hidden', currentUser.name !== 'administrador');
    
    showView('home');
}

(window as any).logout = () => { localStorage.removeItem('app_session'); location.reload(); };

// --- ADMIN USERS ---
function renderAdminUsers() {
    const table = document.getElementById('table-users-body');
    if (!table) return;

    const users = db.query('SELECT * FROM users');
    table.innerHTML = users.map(u => {
        const dateFormatted = new Date(u.createdAt).toLocaleString('pt-BR');
        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="p-4 font-bold text-gray-800">${u.name}</td>
                <td class="p-4 text-gray-500">${u.email || 'N/A'}</td>
                <td class="p-4 font-black text-[10px] text-emerald-600 uppercase">${u.city}</td>
                <td class="p-4 text-gray-400 font-mono text-xs">${dateFormatted}</td>
                <td class="p-4 text-gray-300 font-mono tracking-tighter">${u.password}</td>
                <td class="p-4 text-right">
                    ${u.name === 'administrador' ? 
                        '<span class="text-[9px] font-black uppercase text-gray-300">Lock</span>' : 
                        `<button onclick="deleteRow('users', ${u.id})" class="text-red-400 hover:text-red-600 font-bold uppercase text-[10px]">Excluir</button>`}
                </td>
            </tr>
        `;
    }).join('');
}

// --- ADMIN CITIES ---
function renderAdminCities() {
    const table = document.getElementById('table-cities-body');
    if (!table) return;
    const cities = db.query('SELECT * FROM cities');
    table.innerHTML = cities.map(c => `
        <tr>
            <td class="p-4 font-bold">${c.name}</td>
            <td class="p-4 font-mono text-emerald-600">${c.state}</td>
            <td class="p-4 text-right">
                <button onclick="deleteRow('cities', ${c.id})" class="text-red-400 font-bold uppercase text-[10px]">Remover</button>
            </td>
        </tr>
    `).join('');
}

const cityForm = document.getElementById('form-city');
if (cityForm) {
    cityForm.onsubmit = (e) => {
        e.preventDefault();
        const name = (document.getElementById('input-city-name') as HTMLInputElement).value;
        const state = (document.getElementById('input-city-state') as HTMLInputElement).value.toUpperCase();
        db.query('INSERT INTO cities', [{ name, state }]);
        renderAdminCities();
        (e.target as HTMLFormElement).reset();
        showToast('Cidade inserida via SQL');
    };
}

(window as any).deleteRow = (table: string, id: any) => {
    if (confirm('Deseja realmente excluir este registro?')) {
        db.query(`DELETE FROM ${table}`, [id]);
        if (table === 'users') renderAdminUsers();
        if (table === 'cities') renderAdminCities();
        showToast('Registro deletado');
    }
};

// --- HOME / SHOPPING ---
function renderShoppingDropdowns() {
    const cats = db.query('SELECT * FROM categories');
    const select = document.getElementById('select-category');
    if (select) select.innerHTML = '<option value="">Selecione...</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

// --- UTILITÁRIOS ---
function populateCitiesSelect(elementId: string) {
    const select = document.getElementById(elementId) as HTMLSelectElement;
    const cities = db.query('SELECT * FROM cities');
    if (select) {
        select.innerHTML = '<option value="">Selecione sua Cidade</option>' + 
            cities.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }
}

function showToast(txt: string) {
    const t = document.getElementById('toast');
    const tx = document.getElementById('toast-text');
    if (t && tx) {
        tx.textContent = txt;
        t.classList.remove('translate-y-20');
        setTimeout(() => t.classList.add('translate-y-20'), 2500);
    }
}

// Placeholders globais
(window as any).addItem = () => { showToast('Funcionalidade de Comparação SQL em breve!'); };
