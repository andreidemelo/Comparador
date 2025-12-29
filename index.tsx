
// --- MOTOR SQL SIMULADO (localStorage persistency) ---
class Database {
    private tables: Record<string, any[]> = {};

    constructor() {
        this.load();
    }

    private load() {
        this.tables.users = JSON.parse(localStorage.getItem('db_users') || '[]');
        this.tables.cities = JSON.parse(localStorage.getItem('db_cities') || '[]');
        this.tables.markets = JSON.parse(localStorage.getItem('db_markets') || '[]');
        this.tables.categories = JSON.parse(localStorage.getItem('db_categories') || '[]');
        this.tables.products = JSON.parse(localStorage.getItem('db_products') || '[]');
        this.tables.prices = JSON.parse(localStorage.getItem('db_prices') || '[]');
    }

    private save() {
        localStorage.setItem('db_users', JSON.stringify(this.tables.users));
        localStorage.setItem('db_cities', JSON.stringify(this.tables.cities));
        localStorage.setItem('db_markets', JSON.stringify(this.tables.markets));
        localStorage.setItem('db_categories', JSON.stringify(this.tables.categories));
        localStorage.setItem('db_products', JSON.stringify(this.tables.products));
        localStorage.setItem('db_prices', JSON.stringify(this.tables.prices));
    }

    query(sql: string, params: any[] = []): any[] {
        const parts = sql.trim().toUpperCase().split(/\s+/);
        const command = parts[0];
        let table = '';

        if (command === 'SELECT' || command === 'DELETE' || command === 'UPDATE') {
            const fromIndex = parts.indexOf('FROM') !== -1 ? parts.indexOf('FROM') : parts.indexOf('UPDATE') !== -1 ? parts.indexOf('UPDATE') : -1;
            if (fromIndex !== -1) {
                table = parts[fromIndex + 1].toLowerCase();
            }
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
            this.tables[table] = this.tables[table].filter(row => row.id != id);
            this.save();
            return [];
        }

        if (command === 'UPDATE') {
            const id = params[0];
            const newData = params[1];
            const index = this.tables[table].findIndex(row => row.id == id);
            if (index !== -1) {
                this.tables[table][index] = { ...this.tables[table][index], ...newData };
                this.save();
                return [this.tables[table][index]];
            }
        }

        return [];
    }
}

const db = new Database();

// --- APP STATE ---
let currentUser: any = null;
let shoppingList: any[] = [];

// --- HELPER PARA FORMATAÇÃO NUMÉRICA SEGURA ---
const formatPrice = (val: any): string => {
    const num = parseFloat(val);
    return isNaN(num) ? "0.00" : num.toFixed(2);
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    initDefaultAdmin();
    checkSession();
});

function initDefaultAdmin() {
    const users = db.query('SELECT * FROM users');
    if (!users.find(u => u.name === 'administrador')) {
        db.query('INSERT INTO users', [{
            name: 'administrador', password: 'Mu@300413', email: 'admin@super.com',
            city: 'Sistema', createdAt: new Date().toISOString()
        }]);
    }
}

function checkSession() {
    const session = localStorage.getItem('app_session');
    if (session) {
        currentUser = JSON.parse(session);
        renderApp();
    }
}

// --- NAVIGATION ---
const showView = (vId: string) => {
    document.querySelectorAll('#main-app main > div').forEach(d => d.classList.add('hidden'));
    const t = document.getElementById(`view-${vId}`);
    if (t) {
        t.classList.remove('hidden');
        if (vId === 'home') loadHome();
        if (vId === 'admin-users') renderAdminUsers();
        if (vId === 'admin-cities') renderAdminCities();
        if (vId === 'admin-markets') renderAdminMarkets();
        if (vId === 'admin-categories') renderAdminCategories();
        if (vId === 'admin-products') renderAdminProducts();
        if (vId === 'admin-prices') renderAdminPrices();
    }
};
(window as any).showView = showView;

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

// --- AUTH ---
const authForm = document.getElementById('form-auth');
if (authForm) {
    authForm.onsubmit = (e) => {
        e.preventDefault();
        const uIn = (document.getElementById('auth-username') as HTMLInputElement).value;
        const pIn = (document.getElementById('auth-password') as HTMLInputElement).value;
        const mode = (document.getElementById('btn-tab-login')?.classList.contains('bg-white')) ? 'login' : 'register';

        if (mode === 'register') {
            const eIn = (document.getElementById('auth-email') as HTMLInputElement).value;
            const cIn = (document.getElementById('auth-city') as HTMLSelectElement).value;
            db.query('INSERT INTO users', [{ name: uIn, email: eIn, city: cIn, password: pIn, createdAt: new Date().toISOString() }]);
            showToast('Cadastrado! Faça login.'); (window as any).setAuthMode('login');
        } else {
            const u = db.query('SELECT * FROM users').find(u => u.name === uIn && u.password === pIn);
            if (u) { currentUser = u; localStorage.setItem('app_session', JSON.stringify(u)); renderApp(); }
            else { showToast('Erro de login'); }
        }
    };
}

(window as any).setAuthMode = (mode: string) => {
    const btnL = document.getElementById('btn-tab-login');
    const btnR = document.getElementById('btn-tab-register');
    const regF = document.getElementById('register-fields');
    btnL?.classList.toggle('bg-white', mode === 'login');
    btnR?.classList.toggle('bg-white', mode === 'register');
    regF?.classList.toggle('hidden', mode === 'login');
    if (mode === 'register') populateDropdown('auth-city', 'cities');
};

// --- RENDERERS ---

function renderAdminUsers() {
    const t = document.getElementById('table-users-body');
    if (!t) return;
    t.innerHTML = db.query('SELECT * FROM users').map(u => `
        <tr class="border-b">
            <td class="p-4 font-bold">${u.name}</td>
            <td class="p-4">${u.city}</td>
            <td class="p-4 text-right">${u.name !== 'administrador' ? `<button onclick="deleteRow('users', ${u.id})" class="text-red-500 text-xs font-bold">EXCLUIR</button>` : 'LOCK'}</td>
        </tr>
    `).join('');
}

function renderAdminCities() {
    const t = document.getElementById('table-cities-body');
    if (!t) return;
    t.innerHTML = db.query('SELECT * FROM cities').map(c => `
        <tr class="border-b"><td class="p-4 font-bold">${c.name}</td><td class="p-4">${c.state}</td><td class="p-4 text-right"><button onclick="deleteRow('cities', ${c.id})" class="text-red-500 text-xs font-bold">EXCLUIR</button></td></tr>
    `).join('');
}

function renderAdminMarkets() {
    populateDropdown('market-city', 'cities');
    const t = document.getElementById('table-markets-body');
    if (!t) return;
    t.innerHTML = db.query('SELECT * FROM markets').map(m => `
        <tr class="border-b"><td class="p-4 font-bold">${m.name}</td><td class="p-4">${m.city}</td><td class="p-4 text-gray-400 text-xs">${m.bairro}</td><td class="p-4 text-right"><button onclick="deleteRow('markets', ${m.id})" class="text-red-500 text-xs font-bold">EXCLUIR</button></td></tr>
    `).join('');
}

function renderAdminCategories() {
    const t = document.getElementById('table-categories-body');
    if (!t) return;
    t.innerHTML = db.query('SELECT * FROM categories').map(c => `
        <tr class="border-b"><td class="p-4 font-bold">${c.name}</td><td class="p-4 text-right"><button onclick="deleteRow('categories', ${c.id})" class="text-red-500 text-xs font-bold">EXCLUIR</button></td></tr>
    `).join('');
}

function renderAdminProducts() {
    populateDropdown('product-category', 'categories');
    const t = document.getElementById('table-products-body');
    if (!t) return;
    t.innerHTML = db.query('SELECT * FROM products').map(p => `
        <tr class="border-b"><td class="p-4 font-bold">${p.name}</td><td class="p-4 text-emerald-600 text-[10px] font-black uppercase">${p.category}</td><td class="p-4 text-right"><button onclick="deleteRow('products', ${p.id})" class="text-red-500 text-xs font-bold">EXCLUIR</button></td></tr>
    `).join('');
}

function renderAdminPrices() {
    populateDropdown('price-market', 'markets');
    populateDropdown('price-category', 'categories');
    const t = document.getElementById('table-prices-body');
    if (!t) return;
    
    t.innerHTML = db.query('SELECT * FROM prices').map(p => {
        // Usa helper para garantir exibição numérica sem NaN
        const displayPrice = formatPrice(p.price);
        
        return `
            <tr class="border-b">
                <td class="p-4 font-black text-emerald-600">${displayPrice}</td>
                <td class="p-4 font-bold">${p.market}</td>
                <td class="p-4">${p.product}</td>
                <td class="p-4 text-[10px] text-gray-400">${p.updatedAt}</td>
                <td class="p-4 text-right flex justify-end gap-3">
                    <button onclick="editPrice(${p.id})" class="text-blue-500 text-xs font-bold uppercase">Alterar</button>
                    <button onclick="deleteRow('prices', ${p.id})" class="text-red-500 text-xs font-bold uppercase">Excluir</button>
                </td>
            </tr>
        `;
    }).join('');
}

// --- FORM HANDLERS ---
const setupForm = (id: string, table: string, fields: string[], callback?: Function) => {
    const f = document.getElementById(id);
    if (!f) return;
    f.onsubmit = (e) => {
        e.preventDefault();
        const data: any = {};
        
        const editIdField = document.getElementById('price-id') as HTMLInputElement;
        const editId = editIdField ? editIdField.value : null;

        fields.forEach(fid => {
            const el = document.getElementById(fid) as any;
            if (el) {
                let val = el.value;
                // Tratamento rigoroso de salvamento para consistência total de tipo
                if (fid === 'price-price') {
                    val = formatPrice(val);
                }
                data[fid.split('-').pop()!] = val;
            }
        });

        if (table === 'prices') {
            data.updatedAt = new Date().toLocaleString('pt-BR');
            if (editId) {
                db.query(`UPDATE prices`, [editId, data]);
                showToast('Preço atualizado com sucesso!');
                if (editIdField) editIdField.value = '';
            } else {
                db.query(`INSERT INTO ${table}`, [data]);
                showToast('Preço cadastrado com sucesso!');
            }
        } else {
            db.query(`INSERT INTO ${table}`, [data]);
            showToast('Gravado com sucesso!');
        }

        (e.target as HTMLFormElement).reset();
        if (callback) callback();
    };
};

setupForm('form-city', 'cities', ['input-city-name', 'input-city-state'], renderAdminCities);
setupForm('form-market', 'markets', ['market-name', 'market-city', 'market-bairro'], renderAdminMarkets);
setupForm('form-category', 'categories', ['category-name'], renderAdminCategories);
setupForm('form-product', 'products', ['product-name', 'product-category'], renderAdminProducts);
setupForm('form-price', 'prices', ['price-market', 'price-category', 'price-product', 'price-price'], renderAdminPrices);

// --- CASCADING SELECTS ---
(window as any).onCategoryChangePrice = () => {
    const cat = (document.getElementById('price-category') as HTMLSelectElement).value;
    const pSel = document.getElementById('price-product') as HTMLSelectElement;
    if (!cat) { pSel.disabled = true; return; }
    pSel.disabled = false;
    const prods = db.query('SELECT * FROM products').filter(p => p.category === cat);
    pSel.innerHTML = '<option value="">Produto</option>' + prods.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
};

(window as any).onCategoryChangeHome = () => {
    const cat = (document.getElementById('select-category') as HTMLSelectElement).value;
    const pSel = document.getElementById('select-product') as HTMLSelectElement;
    if (!cat) { pSel.disabled = true; return; }
    pSel.disabled = false;
    const prods = db.query('SELECT * FROM products').filter(p => p.category === cat);
    pSel.innerHTML = prods.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
};

// --- HOME LOGIC ---
function loadHome() {
    populateDropdown('select-category', 'categories');
    updateListDisplay();
}

(window as any).addItem = () => {
    const pSel = document.getElementById('select-product') as HTMLSelectElement;
    if (pSel.disabled || !pSel.value) return;
    const prodName = pSel.value;
    if (!shoppingList.includes(prodName)) {
        shoppingList.push(prodName);
        updateListDisplay();
    }
};

function updateListDisplay() {
    const c = document.getElementById('shopping-list-container');
    const a = document.getElementById('action-compare');
    if (!c) return;
    c.innerHTML = shoppingList.map(item => `
        <div class="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border">
            <span class="font-bold">${item}</span>
            <button onclick="removeItem('${item}')" class="text-red-400">Remover</button>
        </div>
    `).join('');
    a?.classList.toggle('hidden', shoppingList.length === 0);
}

(window as any).removeItem = (name: string) => {
    shoppingList = shoppingList.filter(i => i !== name);
    updateListDisplay();
};

(window as any).runComparison = () => {
    const res = document.getElementById('comparison-results');
    const markets = db.query('SELECT * FROM markets');
    if (!res) return;

    let html = `
        <div class="bg-white rounded-3xl border overflow-hidden">
            <div class="p-6 bg-emerald-50 border-b flex justify-between">
                <h3 class="font-black">Resultados da Pesquisa</h3>
                <button onclick="generatePDF()" class="text-xs font-bold text-emerald-600">PDF</button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-gray-50 text-[10px] font-black uppercase">
                        <tr><th class="p-4">Item</th>${markets.map(m => `<th class="p-4 text-center">${m.name}</th>`).join('')}</tr>
                    </thead>
                    <tbody class="divide-y">
    `;

    let totals: any = {};
    markets.forEach(m => totals[m.name] = 0);

    shoppingList.forEach(item => {
        html += `<tr><td class="p-4 font-bold">${item}</td>`;
        markets.forEach(m => {
            const priceObj = db.query('SELECT * FROM prices').find(p => p.market === m.name && p.product === item);
            const val = priceObj ? parseFloat(priceObj.price) : 0;
            totals[m.name] += isNaN(val) ? 0 : val;
            html += `<td class="p-4 text-center ${val ? '' : 'text-gray-300'}">${val ? 'R$ ' + val.toFixed(2) : '-'}</td>`;
        });
        html += `</tr>`;
    });

    html += `<tr class="bg-gray-50 font-black"><td class="p-4">TOTAL</td>`;
    markets.forEach(m => {
        const total = totals[m.name];
        html += `<td class="p-4 text-center text-emerald-600">R$ ${total.toFixed(2)}</td>`;
    });

    html += `</tr></tbody></table></div></div>`;
    res.innerHTML = html;
    res.classList.remove('hidden');
};

// --- UTILS ---
function populateDropdown(id: string, table: string) {
    const el = document.getElementById(id) as HTMLSelectElement;
    if (!el) return;
    const data = db.query(`SELECT * FROM ${table}`);
    el.innerHTML = (id.includes('auth') || id.includes('select') || id.includes('price')) ? '<option value="">Selecionar...</option>' : '';
    el.innerHTML += data.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
}

(window as any).deleteRow = (table: string, id: any) => {
    if (confirm('Deletar registro?')) {
        db.query(`DELETE FROM ${table}`, [id]);
        showView(`admin-${table}`);
    }
};

(window as any).editPrice = (id: any) => {
    const price = db.query('SELECT * FROM prices').find(p => p.id == id);
    if (!price) return;

    (document.getElementById('price-id') as HTMLInputElement).value = price.id;
    (document.getElementById('price-market') as HTMLSelectElement).value = price.market;
    (document.getElementById('price-category') as HTMLSelectElement).value = price.category;
    
    (window as any).onCategoryChangePrice();
    (document.getElementById('price-product') as HTMLSelectElement).value = price.product;
    
    // Garante que o valor no input de edição esteja no formato numérico correto para o browser
    const numericValue = parseFloat(price.price);
    (document.getElementById('price-price') as HTMLInputElement).value = isNaN(numericValue) ? "" : numericValue.toString();
    
    document.getElementById('form-price')?.scrollIntoView({ behavior: 'smooth' });
    showToast('Modo de edição ativado');
};

function showToast(m: string) {
    const t = document.getElementById('toast');
    const tx = document.getElementById('toast-text');
    if (t && tx) { tx.textContent = m; t.classList.remove('translate-y-20'); setTimeout(() => t.classList.add('translate-y-20'), 2500); }
}

(window as any).generatePDF = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    doc.text("Relatório SuperCompare", 10, 10);
    shoppingList.forEach((it, i) => doc.text(`${i+1}. ${it}`, 10, 20 + (i*10)));
    doc.save("pesquisa.pdf");
};
