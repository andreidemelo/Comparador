
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
                
                // Aplica ordenação alfabética por padrão para tabelas de cadastro
                if (['cities', 'markets', 'categories', 'products', 'users'].includes(table)) {
                    query = query.order('name', { ascending: true });
                } else if (table === 'prices') {
                    // Ordena preços por mercado e produto para melhor visualização
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

// --- HELPER PARA FORMATAÇÃO NUMÉRICA SEGURA ---
const formatPrice = (val: any): string => {
    const num = parseFloat(val);
    return isNaN(num) ? "0.00" : num.toFixed(2);
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
            await db.query('users', 'INSERT', { name: uIn, email: eIn, city: cIn, password: pIn });
            showToast('Cadastrado com sucesso!'); (window as any).setAuthMode('login');
        } else {
            const users = await db.query('users', 'SELECT');
            const u = users.find(u => u.name === uIn && u.password === pIn);
            if (u) { 
                currentUser = u; 
                localStorage.setItem('app_session', JSON.stringify(u)); 
                renderApp(); 
            } else { 
                showToast('Usuário ou senha incorretos'); 
            }
        }
    };
}

(window as any).setAuthMode = async (mode: string) => {
    const btnL = document.getElementById('btn-tab-login');
    const btnR = document.getElementById('btn-tab-register');
    const regF = document.getElementById('register-fields');
    btnL?.classList.toggle('bg-white', mode === 'login');
    btnR?.classList.toggle('bg-white', mode === 'register');
    regF?.classList.toggle('hidden', mode === 'login');
    if (mode === 'register') populateDropdown('auth-city', 'cities');
};

// --- RENDERERS ---

async function renderAdminUsers() {
    const t = document.getElementById('table-users-body');
    if (!t) return;
    const users = await db.query('users', 'SELECT');
    t.innerHTML = users.map(u => `
        <tr class="border-b">
            <td class="p-4 font-bold">${u.name}</td>
            <td class="p-4">${u.city}</td>
            <td class="p-4 text-right">${u.name !== 'administrador' ? `<button onclick="deleteRow('users', ${u.id})" class="text-red-500 text-xs font-bold">EXCLUIR</button>` : 'LOCK'}</td>
        </tr>
    `).join('');
}

async function renderAdminCities() {
    const t = document.getElementById('table-cities-body');
    if (!t) return;
    const cities = await db.query('cities', 'SELECT');
    t.innerHTML = cities.map(c => `
        <tr class="border-b"><td class="p-4 font-bold">${c.name}</td><td class="p-4">${c.state}</td><td class="p-4 text-right"><button onclick="deleteRow('cities', ${c.id})" class="text-red-500 text-xs font-bold">EXCLUIR</button></td></tr>
    `).join('');
}

async function renderAdminMarkets() {
    populateDropdown('market-city', 'cities');
    const t = document.getElementById('table-markets-body');
    if (!t) return;
    const markets = await db.query('markets', 'SELECT');
    t.innerHTML = markets.map(m => `
        <tr class="border-b"><td class="p-4 font-bold">${m.name}</td><td class="p-4">${m.city}</td><td class="p-4 text-gray-400 text-xs">${m.bairro}</td><td class="p-4 text-right"><button onclick="deleteRow('markets', ${m.id})" class="text-red-500 text-xs font-bold">EXCLUIR</button></td></tr>
    `).join('');
}

async function renderAdminCategories() {
    const t = document.getElementById('table-categories-body');
    if (!t) return;
    const categories = await db.query('categories', 'SELECT');
    t.innerHTML = categories.map(c => `
        <tr class="border-b"><td class="p-4 font-bold">${c.name}</td><td class="p-4 text-right"><button onclick="deleteRow('categories', ${c.id})" class="text-red-500 text-xs font-bold">EXCLUIR</button></td></tr>
    `).join('');
}

async function renderAdminProducts() {
    populateDropdown('product-category', 'categories');
    const t = document.getElementById('table-products-body');
    if (!t) return;
    const products = await db.query('products', 'SELECT');
    t.innerHTML = products.map(p => `
        <tr class="border-b"><td class="p-4 font-bold">${p.name}</td><td class="p-4 text-emerald-600 text-[10px] font-black uppercase">${p.category}</td><td class="p-4 text-right"><button onclick="deleteRow('products', ${p.id})" class="text-red-500 text-xs font-bold">EXCLUIR</button></td></tr>
    `).join('');
}

async function renderAdminPrices() {
    populateDropdown('price-market', 'markets');
    populateDropdown('price-category', 'categories');
    const t = document.getElementById('table-prices-body');
    if (!t) return;
    
    const prices = await db.query('prices', 'SELECT');
    t.innerHTML = prices.map(p => {
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
    f.onsubmit = async (e) => {
        e.preventDefault();
        const data: any = {};
        
        const editIdField = document.getElementById('price-id') as HTMLInputElement;
        const editId = editIdField ? editIdField.value : null;

        fields.forEach(fid => {
            const el = document.getElementById(fid) as any;
            if (el) {
                let val = el.value;
                if (fid === 'price-price') val = parseFloat(val) || 0;
                data[fid.split('-').pop()!] = val;
            }
        });

        if (table === 'prices') {
            data.updatedAt = new Date().toLocaleString('pt-BR');
            if (editId) {
                await db.query('prices', 'UPDATE', { id: editId, data });
                showToast('Preço atualizado!');
                if (editIdField) editIdField.value = '';
            } else {
                await db.query('prices', 'INSERT', data);
                showToast('Preço cadastrado!');
            }
        } else {
            await db.query(table, 'INSERT', data);
            showToast('Gravado com sucesso no Supabase!');
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
(window as any).onCategoryChangePrice = async () => {
    const cat = (document.getElementById('price-category') as HTMLSelectElement).value;
    const pSel = document.getElementById('price-product') as HTMLSelectElement;
    if (!cat) { pSel.disabled = true; return; }
    pSel.disabled = false;
    const products = await db.query('products', 'SELECT');
    const prods = products.filter(p => p.category === cat);
    pSel.innerHTML = '<option value="">Produto</option>' + prods.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
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
        <div class="flex justify-between items-center p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div class="flex items-center gap-3">
                <span class="w-8 h-8 bg-emerald-100 text-emerald-700 flex items-center justify-center rounded-lg text-xs font-black">${item.quantity}</span>
                <span class="font-bold text-gray-700">${item.name}</span>
            </div>
            <button onclick="removeItem('${item.name}')" class="text-red-400 hover:text-red-600 transition-colors">
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
        <div class="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden animate-in">
            <div class="p-6 bg-emerald-50 border-b flex justify-between items-center">
                <div>
                    <h3 class="font-black text-emerald-900 tracking-tight uppercase">Comparativo Real (Supabase Cloud)</h3>
                    <p class="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Sincronizado com seu banco de dados</p>
                </div>
                <button onclick="generatePDF()" class="bg-white text-emerald-600 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-emerald-100 shadow-sm">Exportar PDF</button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-gray-50 text-[10px] font-black uppercase text-gray-500">
                        <tr>
                            <th class="p-4 border-r">Item x Qtd</th>
                            ${markets.map(m => `<th class="p-4 text-center border-r min-w-[120px]">${m.name}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y text-sm">
    `;

    let totals: any = {};
    markets.forEach(m => totals[m.name] = 0);

    shoppingList.forEach(item => {
        html += `<tr><td class="p-4 border-r font-medium text-gray-600"><span class="font-black text-gray-900">${item.name}</span> <span class="text-xs text-gray-400">x ${item.quantity}</span></td>`;
        markets.forEach(m => {
            const priceObj = prices.find(p => p.market === m.name && p.product === item.name);
            const unitPrice = priceObj ? parseFloat(priceObj.price) : 0;
            const lineTotal = unitPrice * item.quantity;
            
            totals[m.name] += isNaN(lineTotal) ? 0 : lineTotal;
            
            html += `
                <td class="p-4 text-center border-r ${lineTotal ? '' : 'bg-gray-50/50'}">
                    ${lineTotal ? `
                        <div class="font-black text-gray-800">R$ ${lineTotal.toFixed(2)}</div>
                        <div class="text-[9px] font-bold text-gray-400 uppercase">Un: R$ ${unitPrice.toFixed(2)}</div>
                    ` : '<span class="text-gray-300 font-bold italic text-xs">Indisponível</span>'}
                </td>`;
        });
        html += `</tr>`;
    });

    const validTotals = Object.values(totals).filter((v: any) => v > 0);
    const minTotal = validTotals.length > 0 ? Math.min(...(validTotals as number[])) : 0;

    html += `
        <tr class="bg-emerald-900 text-white font-black">
            <td class="p-6 border-r uppercase tracking-widest">TOTAL DA LISTA</td>
    `;
    
    markets.forEach(m => {
        const total = totals[m.name];
        const isBest = total > 0 && total === minTotal;
        html += `
            <td class="p-6 text-center border-r ${isBest ? 'bg-emerald-500' : ''}">
                <div class="text-xl">R$ ${total.toFixed(2)}</div>
                ${isBest ? '<div class="text-[8px] font-black uppercase tracking-tighter mt-1 bg-white/20 px-1 rounded">MELHOR OPÇÃO</div>' : ''}
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
    el.innerHTML = (id.includes('auth') || id.includes('select') || id.includes('price')) ? '<option value="">Selecionar...</option>' : '';
    el.innerHTML += data.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
}

(window as any).deleteRow = async (table: string, id: any) => {
    if (confirm('Deletar registro?')) {
        await db.query(table, 'DELETE', id);
        showView(`admin-${table}`);
    }
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
    doc.text("Relatório SuperCompare PRO (Supabase)", 10, 10);
    shoppingList.forEach((it, i) => doc.text(`${i+1}. ${it.name} (Qtd: ${it.quantity})`, 10, 25 + (i*8)));
    doc.save("pesquisa_precos.pdf");
};
