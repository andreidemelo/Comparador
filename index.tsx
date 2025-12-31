
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// --- CONFIGURAÇÃO REAL DO SUPABASE ---
const SUPABASE_URL = 'https://zagebrolhkzdqezmijdi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8PbA4ZgMUEYzTRzGhyvMzA_5xebA4Tu';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- MOTOR SQL ADAPTADO PARA SUPABASE ---
class Database {
    async query(table: string, action: 'SELECT' | 'INSERT' | 'DELETE' | 'UPDATE', params: any = null): Promise<any[]> {
        try {
            if (action === 'SELECT') {
                let query = supabase.from(table).select('*');
                
                if (['cities', 'markets', 'categories', 'products', 'users'].includes(table)) {
                    query = query.order('name', { ascending: true });
                } else if (table === 'prices') {
                    query = query.order('market', { ascending: true }).order('product', { ascending: true });
                }

                const { data, error } = await query;
                if (error) throw error;
                return data || [];
            }

            if (action === 'INSERT') {
                const { data, error } = await supabase.from(table).insert([params]).select();
                if (error) throw error;
                return data || [];
            }

            if (action === 'DELETE') {
                const { error } = await supabase.from(table).delete().eq('id', params);
                if (error) throw error;
                return [];
            }

            if (action === 'UPDATE') {
                const { data, error } = await supabase.from(table).update(params.data).eq('id', params.id).select();
                if (error) throw error;
                return data || [];
            }
        } catch (err) {
            console.error(`Erro na operação ${action} em ${table}:`, err);
            return [];
        }
        return [];
    }
}

const db = new Database();

// --- APP STATE ---
let currentUser: any = null;
let shoppingList: { name: string, quantity: number }[] = [];
let html5QrCode: any = null;

// --- HELPERS ---
const formatPrice = (val: any): string => {
    const num = parseFloat(val);
    return isNaN(num) ? "0,00" : num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (iso: string): string => {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR');
};

// --- SCANNER LOGIC ---
const startScanner = async (targetId: string = 'product-barcode') => {
    const container = document.getElementById('scanner-container');
    if (container) container.classList.remove('hidden');
    
    html5QrCode = new (window as any).Html5Qrcode("reader");
    const config = { fps: 15, qrbox: { width: 250, height: 150 } };

    try {
        await html5QrCode.start(
            { facingMode: "environment" }, 
            config, 
            (decodedText: string) => {
                const barcodeInput = document.getElementById(targetId) as HTMLInputElement;
                if (barcodeInput) {
                    barcodeInput.value = decodedText;
                    showToast("Produto Identificado");
                    if (targetId === 'quick-search-barcode') {
                        (window as any).lookupBarcode(decodedText);
                    }
                    stopScanner();
                }
            },
            () => {}
        );
    } catch (err) {
        showToast("Câmera indisponível");
    }
};
(window as any).startScanner = startScanner;

const stopScanner = async () => {
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
        } catch(e) {}
        html5QrCode = null;
    }
    const container = document.getElementById('scanner-container');
    if (container) container.classList.add('hidden');
};
(window as any).stopScanner = stopScanner;

// --- QUICK SEARCH LOGIC ---
(window as any).lookupBarcode = async (barcode: string) => {
    const nameInput = document.getElementById('quick-search-product-name') as HTMLInputElement;
    if (!barcode) {
        if (nameInput) nameInput.value = "";
        return;
    }
    const products = await db.query('products', 'SELECT');
    const product = products.find(p => p.barcode?.toString() === barcode.toString());
    if (nameInput) {
        nameInput.value = product ? product.name : "Produto não encontrado";
    }
};

(window as any).runQuickComparison = async () => {
    const nameInput = document.getElementById('quick-search-product-name') as HTMLInputElement;
    const prodName = nameInput?.value;
    if (!prodName || prodName === "Produto não encontrado" || prodName === "Aguardando código...") {
        showToast("Insira um código de barras válido");
        return;
    }

    // Criar uma lista temporária apenas com este item para a comparação
    const tempOriginalList = [...shoppingList];
    shoppingList = [{ name: prodName, quantity: 1 }];
    
    await (window as any).runComparison();
    
    // Restaurar a lista original para não perder o que o usuário já montou
    shoppingList = tempOriginalList;
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    checkSession();
});

function checkSession() {
    const session = localStorage.getItem('app_session');
    if (session) {
        currentUser = JSON.parse(session);
        renderApp();
    }
}

// --- NAVIGATION ---
const showView = async (vId: string) => {
    // Esconder todas as views
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

async function renderApp() {
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
    authForm.onsubmit = async (e) => {
        e.preventDefault();
        const uIn = (document.getElementById('auth-username') as HTMLInputElement).value;
        const pIn = (document.getElementById('auth-password') as HTMLInputElement).value;
        const mode = (document.getElementById('btn-tab-login')?.classList.contains('bg-white')) ? 'login' : 'register';

        if (mode === 'register') {
            const eIn = (document.getElementById('auth-email') as HTMLInputElement).value;
            const cIn = (document.getElementById('auth-city') as HTMLSelectElement).value;
            await db.query('users', 'INSERT', { name: uIn, email: eIn, city: cIn, password: pIn, created_at: new Date().toISOString() });
            showToast('Conta criada com sucesso!'); (window as any).setAuthMode('login');
        } else {
            const users = await db.query('users', 'SELECT');
            const u = users.find(u => u.name === uIn && u.password === pIn);
            if (u) { 
                currentUser = u; 
                localStorage.setItem('app_session', JSON.stringify(u)); 
                renderApp(); 
            } else { 
                showToast('Acesso negado: dados incorretos'); 
            }
        }
    };
}

(window as any).setAuthMode = async (mode: string) => {
    const btnL = document.getElementById('btn-tab-login');
    const btnR = document.getElementById('btn-tab-register');
    const regF = document.getElementById('register-fields');
    btnL?.classList.toggle('bg-white', mode === 'login');
    btnL?.classList.toggle('shadow-sm', mode === 'login');
    btnR?.classList.toggle('bg-white', mode === 'register');
    btnR?.classList.toggle('shadow-sm', mode === 'register');
    regF?.classList.toggle('hidden', mode === 'login');
    if (mode === 'register') populateDropdown('auth-city', 'cities');
};

// --- RENDERERS ---

async function renderAdminUsers() {
    populateDropdown('user-admin-city', 'cities');
    const t = document.getElementById('table-users-body');
    if (!t) return;
    const users = await db.query('users', 'SELECT');
    t.innerHTML = users.map(u => `
        <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
            <td class="p-6 font-bold text-slate-800">${u.name}</td>
            <td class="p-6 text-slate-500">${u.email || '-'}</td>
            <td class="p-6 font-medium text-slate-600">${u.city || '-'}</td>
            <td class="p-6 text-slate-400 font-medium">${formatDate(u.created_at)}</td>
            <td class="p-6 text-slate-300 font-mono text-[10px]">${u.password}</td>
            <td class="p-6 text-right flex justify-end gap-4">
                ${u.name !== 'administrador' ? `
                    <button onclick="editUser(${u.id})" class="text-emerald-600 font-bold uppercase text-[10px] tracking-widest hover:underline">Editar</button>
                    <button onclick="deleteRow('users', ${u.id})" class="text-red-400 font-bold uppercase text-[10px] tracking-widest hover:underline">Apagar</button>
                ` : '<span class="text-slate-200 font-bold uppercase text-[10px] tracking-widest">Protegido</span>'}
            </td>
        </tr>
    `).join('');
}

async function renderAdminCities() {
    const t = document.getElementById('table-cities-body');
    if (!t) return;
    const cities = await db.query('cities', 'SELECT');
    t.innerHTML = cities.map(c => `
        <tr class="border-b border-slate-50">
            <td class="p-6 font-bold text-slate-800">${c.name}</td>
            <td class="p-6 text-slate-500 font-bold">${c.state}</td>
            <td class="p-6 text-right flex justify-end gap-4">
                <button onclick="editCity(${c.id})" class="text-emerald-600 text-[10px] font-bold uppercase tracking-widest">Editar</button>
                <button onclick="deleteRow('cities', ${c.id})" class="text-red-400 text-[10px] font-bold uppercase tracking-widest">Apagar</button>
            </td>
        </tr>
    `).join('');
}

async function renderAdminMarkets() {
    populateDropdown('market-city', 'cities');
    const t = document.getElementById('table-markets-body');
    if (!t) return;
    const markets = await db.query('markets', 'SELECT');
    t.innerHTML = markets.map(m => `
        <tr class="border-b border-slate-50">
            <td class="p-6 font-bold text-slate-800">${m.name}</td>
            <td class="p-6 text-slate-600 font-medium">${m.city}</td>
            <td class="p-6 text-slate-400 font-medium">${m.bairro}</td>
            <td class="p-6 text-right flex justify-end gap-4">
                <button onclick="editMarket(${m.id})" class="text-emerald-600 text-[10px] font-bold uppercase tracking-widest">Editar</button>
                <button onclick="deleteRow('markets', ${m.id})" class="text-red-400 text-[10px] font-bold uppercase tracking-widest">Apagar</button>
            </td>
        </tr>
    `).join('');
}

async function renderAdminCategories() {
    const t = document.getElementById('table-categories-body');
    if (!t) return;
    const categories = await db.query('categories', 'SELECT');
    t.innerHTML = categories.map(c => `
        <tr class="border-b border-slate-50">
            <td class="p-6 font-bold text-slate-800">${c.name}</td>
            <td class="p-6 text-right flex justify-end gap-4">
                <button onclick="editCategory(${c.id})" class="text-emerald-600 text-[10px] font-bold uppercase tracking-widest">Editar</button>
                <button onclick="deleteRow('categories', ${c.id})" class="text-red-400 text-[10px] font-bold uppercase tracking-widest">Apagar</button>
            </td>
        </tr>
    `).join('');
}

async function renderAdminProducts() {
    populateDropdown('product-category', 'categories');
    const t = document.getElementById('table-products-body');
    if (!t) return;
    const products = await db.query('products', 'SELECT');
    t.innerHTML = products.map(p => `
        <tr class="border-b border-slate-50">
            <td class="p-6 font-bold text-slate-800">${p.name}</td>
            <td class="p-6"><span class="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest">${p.category}</span></td>
            <td class="p-6 text-slate-400 font-mono text-[10px]">${p.barcode || '-'}</td>
            <td class="p-6 text-right flex justify-end gap-4">
                <button onclick="editProduct(${p.id})" class="text-emerald-600 text-[10px] font-bold uppercase tracking-widest">Editar</button>
                <button onclick="deleteRow('products', ${p.id})" class="text-red-400 text-[10px] font-bold uppercase tracking-widest">Apagar</button>
            </td>
        </tr>
    `).join('');
}

async function renderAdminPrices() {
    populateDropdown('price-market', 'markets');
    populateDropdown('price-category', 'categories');
    const t = document.getElementById('table-prices-body');
    if (!t) return;
    
    const prices = await db.query('prices', 'SELECT');
    t.innerHTML = prices.map(p => {
        return `
            <tr class="border-b border-slate-50">
                <td class="p-6 font-extrabold text-emerald-600">R$ ${formatPrice(p.price)}</td>
                <td class="p-6 font-bold text-slate-800">${p.market}</td>
                <td class="p-6 text-slate-600 font-medium">${p.product}</td>
                <td class="p-6 text-[10px] text-slate-400 font-medium">${p.updatedAt ? p.updatedAt.split(',')[0] : '-'}</td>
                <td class="p-6 text-right flex justify-end gap-4">
                    <button onclick="editPrice(${p.id})" class="text-emerald-600 text-[10px] font-bold uppercase tracking-widest">Editar</button>
                    <button onclick="deleteRow('prices', ${p.id})" class="text-red-400 text-[10px] font-bold uppercase tracking-widest">Apagar</button>
                </td>
            </tr>
        `;
    }).join('');
}

// --- FORM HANDLERS ---
const setupForm = (id: string, table: string, fields: string[], callback?: Function) => {
    const f = document.getElementById(id);
    if (!f) return;
    f.onsubmit = async (e) => {
        e.preventDefault();
        const data: any = {};
        
        let idBase = table === 'cities' ? 'city' : table.slice(0, -1);
        if (id.includes('user')) idBase = 'user-admin';
        
        const editIdField = document.getElementById(`${idBase}-id`) as HTMLInputElement;
        const editId = editIdField ? editIdField.value : null;

        fields.forEach(fid => {
            const el = document.getElementById(fid) as any;
            if (el) {
                let val = el.value;
                if (fid.includes('price') && fid.endsWith('price')) val = parseFloat(val) || 0;
                const prop = fid.split('-').pop()!;
                data[prop] = val;
            }
        });

        if (table === 'prices') data.updatedAt = new Date().toLocaleString('pt-BR');
        if (table === 'users' && !editId) data.created_at = new Date().toISOString();

        if (editId) {
            await db.query(table, 'UPDATE', { id: editId, data });
            showToast('Atualizado!');
            if (editIdField) editIdField.value = '';
        } else {
            await db.query(table, 'INSERT', data);
            showToast('Cadastrado!');
        }

        (e.target as HTMLFormElement).reset();
        if (callback) callback();
    };
};

setupForm('form-city', 'cities', ['input-city-name', 'input-city-state'], renderAdminCities);
setupForm('form-market', 'markets', ['market-name', 'market-city', 'market-bairro'], renderAdminMarkets);
setupForm('form-category', 'categories', ['category-name'], renderAdminCategories);
setupForm('form-product', 'products', ['product-name', 'product-category', 'product-barcode'], renderAdminProducts);
setupForm('form-price', 'prices', ['price-market', 'price-category', 'price-product', 'price-price'], renderAdminPrices);
setupForm('form-user-admin', 'users', ['user-admin-name', 'user-admin-email', 'user-admin-city', 'user-admin-password'], renderAdminUsers);

(window as any).editCity = async (id: any) => {
    const data = await db.query('cities', 'SELECT');
    const item = data.find(x => x.id == id);
    if (!item) return;
    (document.getElementById('city-id') as HTMLInputElement).value = item.id;
    (document.getElementById('input-city-name') as HTMLInputElement).value = item.name;
    (document.getElementById('input-city-state') as HTMLInputElement).value = item.state;
    document.getElementById('form-city')?.scrollIntoView({ behavior: 'smooth' });
};

(window as any).editMarket = async (id: any) => {
    const data = await db.query('markets', 'SELECT');
    const item = data.find(x => x.id == id);
    if (!item) return;
    (document.getElementById('market-id') as HTMLInputElement).value = item.id;
    (document.getElementById('market-name') as HTMLInputElement).value = item.name;
    (document.getElementById('market-city') as HTMLSelectElement).value = item.city;
    (document.getElementById('market-bairro') as HTMLInputElement).value = item.bairro;
    document.getElementById('form-market')?.scrollIntoView({ behavior: 'smooth' });
};

(window as any).editCategory = async (id: any) => {
    const data = await db.query('categories', 'SELECT');
    const item = data.find(x => x.id == id);
    if (!item) return;
    (document.getElementById('category-id') as HTMLInputElement).value = item.id;
    (document.getElementById('category-name') as HTMLInputElement).value = item.name;
    document.getElementById('form-category')?.scrollIntoView({ behavior: 'smooth' });
};

(window as any).editProduct = async (id: any) => {
    const data = await db.query('products', 'SELECT');
    const item = data.find(x => x.id == id);
    if (!item) return;
    (document.getElementById('product-id') as HTMLInputElement).value = item.id;
    (document.getElementById('product-category') as HTMLSelectElement).value = item.category;
    (document.getElementById('product-name') as HTMLInputElement).value = item.name;
    (document.getElementById('product-barcode') as HTMLInputElement).value = item.barcode || '';
    document.getElementById('form-product')?.scrollIntoView({ behavior: 'smooth' });
};

(window as any).editPrice = async (id: any) => {
    const prices = await db.query('prices', 'SELECT');
    const price = prices.find(p => p.id == id);
    if (!price) return;
    (document.getElementById('price-id') as HTMLInputElement).value = price.id;
    (document.getElementById('price-market') as HTMLSelectElement).value = price.market;
    (document.getElementById('price-category') as HTMLSelectElement).value = price.category;
    await (window as any).onCategoryChangePrice();
    (document.getElementById('price-product') as HTMLSelectElement).value = price.product;
    (document.getElementById('price-price') as HTMLInputElement).value = price.price.toString();
    document.getElementById('form-price')?.scrollIntoView({ behavior: 'smooth' });
};

(window as any).editUser = async (id: any) => {
    const users = await db.query('users', 'SELECT');
    const u = users.find(x => x.id == id);
    if (!u) return;
    (document.getElementById('user-admin-id') as HTMLInputElement).value = u.id;
    (document.getElementById('user-admin-name') as HTMLInputElement).value = u.name;
    (document.getElementById('user-admin-email') as HTMLInputElement).value = u.email || '';
    (document.getElementById('user-admin-city') as HTMLSelectElement).value = u.city || '';
    (document.getElementById('user-admin-password') as HTMLInputElement).value = u.password;
    document.getElementById('form-user-admin')?.scrollIntoView({ behavior: 'smooth' });
};

// --- CASCADING SELECTS ---
(window as any).onCategoryChangePrice = async () => {
    const cat = (document.getElementById('price-category') as HTMLSelectElement).value;
    const pSel = document.getElementById('price-product') as HTMLSelectElement;
    if (!cat) { pSel.disabled = true; return; }
    pSel.disabled = false;
    const products = await db.query('products', 'SELECT');
    const prods = products.filter(p => p.category === cat);
    pSel.innerHTML = '<option value="">Qual item?</option>' + prods.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
};

(window as any).onCategoryChangeHome = async () => {
    const cat = (document.getElementById('select-category') as HTMLSelectElement).value;
    const pSel = document.getElementById('select-product') as HTMLSelectElement;
    if (!cat) { pSel.disabled = true; return; }
    pSel.disabled = false;
    const products = await db.query('products', 'SELECT');
    const prods = products.filter(p => p.category === cat);
    pSel.innerHTML = prods.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
};

// --- HOME LOGIC ---
async function loadHome() {
    populateDropdown('select-category', 'categories');
    updateListDisplay();
    // Limpar campos de pesquisa rápida
    const qb = document.getElementById('quick-search-barcode') as HTMLInputElement;
    const qn = document.getElementById('quick-search-product-name') as HTMLInputElement;
    if (qb) qb.value = "";
    if (qn) qn.value = "";
}

(window as any).changeQuantity = (delta: number) => {
    const qIn = document.getElementById('select-quantity') as HTMLInputElement;
    if (!qIn) return;
    let val = parseInt(qIn.value) || 1;
    val += delta;
    if (val < 1) val = 1;
    qIn.value = val.toString();
};

(window as any).addItem = () => {
    const pSel = document.getElementById('select-product') as HTMLSelectElement;
    const qIn = document.getElementById('select-quantity') as HTMLInputElement;
    if (pSel.disabled || !pSel.value) return;
    
    const prodName = pSel.value;
    const quantity = parseInt(qIn.value) || 1;
    
    const existing = shoppingList.find(i => i.name === prodName);
    if (existing) {
        existing.quantity += quantity;
    } else {
        shoppingList.push({ name: prodName, quantity });
    }
    
    qIn.value = "1";
    updateListDisplay();
};

function updateListDisplay() {
    const c = document.getElementById('shopping-list-container');
    const a = document.getElementById('action-compare');
    if (!c) return;
    c.innerHTML = shoppingList.map(item => `
        <div class="group flex justify-between items-center p-6 bg-slate-50 rounded-2xl border border-transparent hover:bg-white hover:border-slate-100 transition-all">
            <div class="flex items-center gap-4">
                <span class="w-10 h-10 bg-white text-slate-800 flex items-center justify-center rounded-xl text-xs font-black shadow-sm">${item.quantity}</span>
                <span class="font-bold text-slate-700">${item.name}</span>
            </div>
            <button onclick="removeItem('${item.name}')" class="text-slate-300 hover:text-red-500 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
        </div>
    `).join('');
    a?.classList.toggle('hidden', shoppingList.length === 0);
}

(window as any).removeItem = (name: string) => {
    shoppingList = shoppingList.filter(i => i.name !== name);
    updateListDisplay();
};

(window as any).runComparison = async () => {
    const res = document.getElementById('comparison-results');
    const markets = await db.query('markets', 'SELECT');
    const prices = await db.query('prices', 'SELECT');
    if (!res) return;

    let html = `
        <div class="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden animate-in">
            <div class="p-8 bg-slate-50/50 border-b flex justify-between items-center">
                <div>
                    <h3 class="font-extrabold text-slate-900 tracking-tight uppercase text-sm">Painel Comparativo</h3>
                    <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Valores atualizados em tempo real</p>
                </div>
                <button onclick="generatePDF()" class="bg-white text-slate-800 px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest border border-slate-100 shadow-sm hover:bg-slate-50 transition-all">Gerar Relatório</button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-white text-[10px] font-bold uppercase text-slate-400">
                        <tr>
                            <th class="p-6">Lista de Itens</th>
                            ${markets.map(m => `<th class="p-6 text-center min-w-[140px]">${m.name}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-50 text-sm">
    `;

    let totals: any = {};
    markets.forEach(m => totals[m.name] = 0);

    shoppingList.forEach(item => {
        html += `<tr><td class="p-6 font-medium text-slate-600"><span class="font-bold text-slate-900">${item.name}</span> <span class="text-xs text-slate-300 ml-1">x${item.quantity}</span></td>`;
        markets.forEach(m => {
            const priceObj = prices.find(p => p.market === m.name && p.product === item.name);
            const unitPrice = priceObj ? parseFloat(priceObj.price) : 0;
            const lineTotal = unitPrice * item.quantity;
            
            totals[m.name] += isNaN(lineTotal) ? 0 : lineTotal;
            
            html += `
                <td class="p-6 text-center">
                    ${lineTotal ? `
                        <div class="font-extrabold text-slate-800 text-base">R$ ${formatPrice(lineTotal)}</div>
                        <div class="text-[8px] font-bold text-slate-300 uppercase">Unit: R$ ${formatPrice(unitPrice)}</div>
                    ` : '<span class="text-slate-200 text-[10px] font-bold uppercase italic tracking-widest">---</span>'}
                </td>`;
        });
        html += `</tr>`;
    });

    const validTotals = Object.values(totals).filter((v: any) => v > 0);
    const minTotal = validTotals.length > 0 ? Math.min(...(validTotals as number[])) : 0;

    html += `
        <tr class="bg-slate-900 text-white font-bold">
            <td class="p-8 uppercase tracking-widest text-[10px]">TOTAL FINAL</td>
    `;
    
    markets.forEach(m => {
        const total = totals[m.name];
        const isBest = total > 0 && total === minTotal;
        html += `
            <td class="p-8 text-center ${isBest ? 'bg-emerald-600' : ''}">
                <div class="text-xl font-extrabold">R$ ${formatPrice(total)}</div>
                ${isBest ? '<div class="text-[8px] font-bold uppercase tracking-widest mt-2 bg-emerald-500/50 py-1 px-2 rounded-lg">Melhor Preço</div>' : ''}
            </td>`;
    });

    html += `</tr></tbody></table></div></div>`;
    res.innerHTML = html;
    res.classList.remove('hidden');
    res.scrollIntoView({ behavior: 'smooth' });
};

// --- UTILS ---
async function populateDropdown(id: string, table: string) {
    const el = document.getElementById(id) as HTMLSelectElement;
    if (!el) return;
    const data = await db.query(table, 'SELECT');
    el.innerHTML = (id.includes('auth') || id.includes('select') || id.includes('price') || id.includes('admin')) ? '<option value="">Selecionar...</option>' : '';
    el.innerHTML += data.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
}

(window as any).deleteRow = async (table: string, id: any) => {
    if (confirm('Remover registro?')) {
        await db.query(table, 'DELETE', id);
        showView(`admin-${table}`);
    }
};

function showToast(m: string) {
    const t = document.getElementById('toast');
    const tx = document.getElementById('toast-text');
    if (t && tx) { tx.textContent = m; t.classList.remove('translate-y-32'); setTimeout(() => t.classList.add('translate-y-32'), 3000); }
}

(window as any).generatePDF = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("SuperCompare - Relatório de Economia", 20, 20);
    doc.setFontSize(10);
    doc.text(`Lista de: ${currentUser.name} - ${new Date().toLocaleDateString()}`, 20, 30);
    shoppingList.forEach((it, i) => doc.text(`${i+1}. ${it.name} (Qtd: ${it.quantity})`, 20, 45 + (i*8)));
    doc.save("SuperCompare-Lista.pdf");
};
