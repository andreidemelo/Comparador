
// --- MOTOR SQL SIMULADO (localStorage persistency) ---
class Database {
    private tables: Record<string, any[]> = {};

    constructor() {
        this.load();
    }

    private load() {
        this.tables.users = JSON.parse(localStorage.getItem('db_users') || '[]');
        this.tables.cities = JSON.parse(localStorage.getItem('db_cities') || '[]');
        this.tables.categories = JSON.parse(localStorage.getItem('db_categories') || '["Mercearia", "Carnes", "Laticínios", "Higiene"]');
        
        // Mock data para produtos e preços se não existir
        this.tables.products = JSON.parse(localStorage.getItem('db_products') || JSON.stringify([
            { id: 1, name: "Arroz 5kg", cat: "Mercearia" },
            { id: 2, name: "Feijão 1kg", cat: "Mercearia" },
            { id: 3, name: "Picanha KG", cat: "Carnes" },
            { id: 4, name: "Leite Integral 1L", cat: "Laticínios" },
            { id: 5, name: "Sabonete", cat: "Higiene" }
        ]));

        this.tables.markets = ["SuperBom", "Atacadão", "Extra", "Pão de Açúcar"];

        // Preços simulados (Normalmente viriam de um INSERT SQL massivo)
        this.tables.prices = JSON.parse(localStorage.getItem('db_prices') || JSON.stringify([
            { productId: 1, market: "SuperBom", price: 22.50 },
            { productId: 1, market: "Atacadão", price: 19.90 },
            { productId: 1, market: "Extra", price: 24.00 },
            { productId: 2, market: "SuperBom", price: 7.80 },
            { productId: 2, market: "Atacadão", price: 6.50 },
            { productId: 3, market: "SuperBom", price: 65.00 },
            { productId: 3, market: "Atacadão", price: 59.90 },
            { productId: 4, market: "SuperBom", price: 4.50 },
            { productId: 4, market: "Extra", price: 4.20 }
        ]));
    }

    private save() {
        localStorage.setItem('db_users', JSON.stringify(this.tables.users));
        localStorage.setItem('db_cities', JSON.stringify(this.tables.cities));
    }

    query(sql: string, params: any[] = []): any[] {
        const parts = sql.trim().toUpperCase().split(/\s+/);
        const command = parts[0];
        let table = '';

        if (command === 'SELECT' || command === 'DELETE') {
            const fromIndex = parts.indexOf('FROM');
            if (fromIndex !== -1) table = parts[fromIndex + 1].toLowerCase();
        } else if (command === 'INSERT') {
            const intoIndex = parts.indexOf('INTO');
            if (intoIndex !== -1) table = parts[intoIndex + 1].toLowerCase();
        }

        if (!table || !this.tables[table]) return [];

        if (command === 'SELECT') {
            return [...this.tables[table]];
        }

        if (command === 'INSERT') {
            const data = { ...params[0], id: Date.now() };
            this.tables[table].push(data);
            this.save();
            return [data];
        }

        if (command === 'DELETE') {
            const id = params[0];
            this.tables[table] = this.tables[table].filter(row => row.id !== id && row.name !== id);
            this.save();
            return [];
        }

        return [];
    }

    // Função de auxílio para o comparador
    getPricesByProduct(id: number) {
        return this.tables.prices.filter(p => p.productId == id);
    }
}

const db = new Database();

// --- APP STATE ---
let currentUser: any = null;
let authMode: 'login' | 'register' = 'login';
let shoppingList: any[] = [];

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    initAdmin();
    checkSession();
});

function initAdmin() {
    const users = db.query('SELECT * FROM users');
    if (!users.find(u => u.name === 'administrador')) {
        db.query('INSERT INTO users', [{
            name: 'administrador',
            password: 'Mu@300413',
            email: 'admin@supercompare.com',
            city: 'Sistema Central',
            createdAt: new Date().toISOString()
        }]);
    }
    if (db.query('SELECT * FROM cities').length === 0) {
        db.query('INSERT INTO cities', [{ name: 'São Paulo', state: 'SP' }]);
    }
}

function checkSession() {
    const session = localStorage.getItem('app_session');
    if (session) {
        currentUser = JSON.parse(session);
        renderApp();
    }
}

// --- AUTH LOGIC ---
const setAuthMode = (mode: 'login' | 'register') => {
    authMode = mode;
    const btnL = document.getElementById('btn-tab-login');
    const btnR = document.getElementById('btn-tab-register');
    const regF = document.getElementById('register-fields');
    const btnS = document.getElementById('btn-auth-submit');

    if (btnL) btnL.className = mode === 'login' ? 'flex-1 py-2 text-xs font-black uppercase rounded-lg bg-white shadow-sm text-emerald-600' : 'flex-1 py-2 text-xs font-black uppercase rounded-lg text-gray-400';
    if (btnR) btnR.className = mode === 'register' ? 'flex-1 py-2 text-xs font-black uppercase rounded-lg bg-white shadow-sm text-emerald-600' : 'flex-1 py-2 text-xs font-black uppercase rounded-lg text-gray-400';
    if (regF) regF.classList.toggle('hidden', mode === 'login');
    if (btnS) btnS.textContent = mode === 'login' ? 'Acessar App' : 'Confirmar Cadastro';
    if (mode === 'register') populateCitiesDropdown();
};
(window as any).setAuthMode = setAuthMode;

const authForm = document.getElementById('form-auth');
if (authForm) {
    authForm.onsubmit = (e) => {
        e.preventDefault();
        const uIn = (document.getElementById('auth-username') as HTMLInputElement).value.trim();
        const pIn = (document.getElementById('auth-password') as HTMLInputElement).value;
        const err = document.getElementById('auth-error');

        if (authMode === 'register') {
            const eIn = (document.getElementById('auth-email') as HTMLInputElement).value;
            const cIn = (document.getElementById('auth-city') as HTMLSelectElement).value;
            if (!cIn) { if(err){err.textContent='Selecione a cidade';err.classList.remove('hidden');} return; }
            db.query('INSERT INTO users', [{ name: uIn, email: eIn, city: cIn, password: pIn, createdAt: new Date().toISOString() }]);
            showToast('Cadastro realizado!'); setAuthMode('login');
        } else {
            const u = db.query('SELECT * FROM users').find(u => u.name === uIn && u.password === pIn);
            if (u) { currentUser = u; localStorage.setItem('app_session', JSON.stringify(u)); renderApp(); }
            else { if(err){err.textContent='Login inválido';err.classList.remove('hidden');} }
        }
    };
}

// --- APP RENDER & NAVIGATION ---
function renderApp() {
    document.getElementById('auth-section')?.classList.add('hidden');
    document.getElementById('main-app')?.classList.remove('hidden');
    
    const hN = document.getElementById('header-user-name');
    const hC = document.getElementById('header-user-city');
    const nA = document.getElementById('nav-admin');

    if (hN) hN.textContent = currentUser.name;
    if (hC) hC.textContent = currentUser.city;
    if (nA) nA.classList.toggle('hidden', currentUser.name !== 'administrador');
    
    showView('home');
}

(window as any).logout = () => { localStorage.removeItem('app_session'); location.reload(); };

const showView = (vId: string) => {
    document.querySelectorAll('#main-app main > div').forEach(d => d.classList.add('hidden'));
    const t = document.getElementById(`view-${vId}`);
    if (t) {
        t.classList.remove('hidden');
        if (vId === 'home') loadHome();
        if (vId === 'admin-users') renderAdminUsers();
        if (vId === 'admin-cities') renderAdminCities();
    }
};
(window as any).showView = showView;

// --- HOME LOGIC ---
function loadHome() {
    const cats = db.query('SELECT * FROM categories');
    const sel = document.getElementById('select-category');
    if (sel) sel.innerHTML = '<option value="">Categoria</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    updateListDisplay();
}

(window as any).onCategoryChange = () => {
    const cat = (document.getElementById('select-category') as HTMLSelectElement).value;
    const selP = document.getElementById('select-product') as HTMLSelectElement;
    if (!cat) { selP.disabled = true; return; }
    
    const products = (db as any).tables.products.filter((p: any) => p.cat === cat);
    selP.disabled = false;
    selP.innerHTML = products.map((p: any) => `<option value="${p.id}">${p.name}</option>`).join('');
};

(window as any).addItem = () => {
    const selP = document.getElementById('select-product') as HTMLSelectElement;
    if (selP.disabled || !selP.value) return;
    
    const prodId = parseInt(selP.value);
    const prod = (db as any).tables.products.find((p: any) => p.id === prodId);
    
    if (!shoppingList.find(i => i.id === prodId)) {
        shoppingList.push(prod);
        updateListDisplay();
        showToast(`${prod.name} adicionado`);
    } else {
        showToast('Item já está na lista');
    }
};

function updateListDisplay() {
    const cont = document.getElementById('shopping-list-container');
    const act = document.getElementById('action-compare');
    if (!cont) return;

    if (shoppingList.length === 0) {
        cont.innerHTML = '<p class="text-center text-gray-300 py-10 font-bold uppercase text-[10px] tracking-widest italic">Sua lista está vazia</p>';
        act?.classList.add('hidden');
    } else {
        cont.innerHTML = shoppingList.map(item => `
            <div class="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 animate-in">
                <div>
                    <p class="font-black text-gray-800">${item.name}</p>
                    <p class="text-[9px] font-black uppercase text-emerald-600">${item.cat}</p>
                </div>
                <button onclick="removeItem(${item.id})" class="p-2 text-red-300 hover:text-red-500 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </div>
        `).join('');
        act?.classList.remove('hidden');
    }
}

(window as any).removeItem = (id: number) => {
    shoppingList = shoppingList.filter(i => i.id !== id);
    updateListDisplay();
    document.getElementById('comparison-results')?.classList.add('hidden');
};

// --- COMPARISON LOGIC (The core feature) ---
(window as any).runComparison = () => {
    const markets = (db as any).tables.markets;
    const resSec = document.getElementById('comparison-results');
    const resHead = document.getElementById('results-header');
    const resBody = document.getElementById('results-body');
    const resFoot = document.getElementById('results-footer');

    if (!resSec || !resHead || !resBody || !resFoot) return;

    // Header: Mercados
    resHead.innerHTML = '<th class="p-4">Produto</th>' + markets.map((m: string) => `<th class="p-4 text-center">${m}</th>`).join('');

    // Body: Linhas por produto
    let marketTotals: Record<string, number> = {};
    markets.forEach((m: string) => marketTotals[m] = 0);

    resBody.innerHTML = shoppingList.map(item => {
        const prices = db.getPricesByProduct(item.id);
        let cells = markets.map((m: string) => {
            const pObj = prices.find(p => p.market === m);
            const val = pObj ? pObj.price : null;
            if (val) marketTotals[m] += val;
            return `<td class="p-4 text-center ${val ? 'text-gray-900' : 'text-gray-300 italic'}">${val ? 'R$ ' + val.toFixed(2) : '-'}</td>`;
        }).join('');

        return `<tr><td class="p-4 text-emerald-800">${item.name}</td>${cells}</tr>`;
    }).join('');

    // Footer: Totais
    const lowestTotal = Math.min(...Object.values(marketTotals).filter(v => v > 0));
    resFoot.innerHTML = `<tr class="bg-emerald-50"><td class="p-4 font-black text-emerald-900 uppercase">Total Estimado</td>` + 
        markets.map((m: string) => {
            const t = marketTotals[m];
            const isWinner = t === lowestTotal && t > 0;
            return `<td class="p-4 text-center font-black ${isWinner ? 'text-emerald-600' : 'text-gray-500'}">
                ${t > 0 ? 'R$ ' + t.toFixed(2) : '-'}
                ${isWinner ? '<br><span class="text-[9px] bg-emerald-500 text-white px-2 py-0.5 rounded-full">MELHOR OPÇÃO</span>' : ''}
            </td>`;
        }).join('') + `</tr>`;

    resSec.classList.remove('hidden');
    resSec.scrollIntoView({ behavior: 'smooth' });
};

// --- ADMIN RENDERERS ---
function renderAdminUsers() {
    const t = document.getElementById('table-users-body');
    if (!t) return;
    const users = db.query('SELECT * FROM users');
    t.innerHTML = users.map(u => `
        <tr>
            <td class="p-4 font-bold">${u.name}</td>
            <td class="p-4 text-gray-500">${u.email}</td>
            <td class="p-4 font-black text-[10px] text-emerald-600 uppercase">${u.city}</td>
            <td class="p-4 text-xs font-mono text-gray-400">${new Date(u.createdAt).toLocaleDateString()}</td>
            <td class="p-4 font-mono text-gray-300 text-xs">${u.password}</td>
            <td class="p-4 text-right">${u.name !== 'administrador' ? `<button onclick="deleteRow('users', '${u.name}')" class="text-red-400 font-bold uppercase text-[10px]">Excluir</button>` : 'LOCK'}</td>
        </tr>
    `).join('');
}

function renderAdminCities() {
    const t = document.getElementById('table-cities-body');
    if (!t) return;
    const cities = db.query('SELECT * FROM cities');
    t.innerHTML = cities.map(c => `<tr><td class="p-4 font-bold">${c.name}</td><td class="p-4 text-emerald-600 font-mono">${c.state}</td><td class="p-4 text-right"><button onclick="deleteRow('cities', ${c.id})" class="text-red-400 font-bold uppercase text-[10px]">Remover</button></td></tr>`).join('');
}

(window as any).deleteRow = (tbl: string, id: any) => {
    if (confirm('Deletar via SQL permanentemente?')) {
        db.query(`DELETE FROM ${tbl}`, [id]);
        if (tbl === 'users') renderAdminUsers();
        if (tbl === 'cities') renderAdminCities();
        showToast('Registro excluído');
    }
};

const cForm = document.getElementById('form-city');
if (cForm) {
    cForm.onsubmit = (e) => {
        e.preventDefault();
        const n = (document.getElementById('input-city-name') as HTMLInputElement).value;
        const s = (document.getElementById('input-city-state') as HTMLInputElement).value;
        db.query('INSERT INTO cities', [{ name: n, state: s }]);
        renderAdminCities(); (e.target as HTMLFormElement).reset();
    };
}

// --- UTILS ---
function populateCitiesDropdown() {
    const sel = document.getElementById('auth-city');
    const cities = db.query('SELECT * FROM cities');
    if (sel) sel.innerHTML = '<option value="">Cidade</option>' + cities.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
}

function showToast(m: string) {
    const t = document.getElementById('toast');
    const tx = document.getElementById('toast-text');
    if (t && tx) {
        tx.textContent = m;
        t.classList.remove('translate-y-20');
        setTimeout(() => t.classList.add('translate-y-20'), 2500);
    }
}

(window as any).generatePDF = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text("Relatório SuperCompare", 10, 20);
    doc.setFontSize(12);
    doc.text(`Cliente: ${currentUser.name}`, 10, 30);
    doc.text(`Data: ${new Date().toLocaleDateString()}`, 10, 40);
    
    let y = 60;
    shoppingList.forEach((item, i) => {
        doc.text(`${i+1}. ${item.name} (${item.cat})`, 10, y);
        y += 10;
    });
    
    doc.save("lista-economica.pdf");
    showToast('Relatório gerado!');
};
