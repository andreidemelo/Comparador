
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

/**
 * --- SCRIPT SQL PARA O SUPABASE ---
 * Execute este comando no "SQL Editor" do seu Supabase para garantir a estrutura correta:
 * 
 * create table if not exists saved_lists (
 *    id bigint primary key generated always as identity, 
 *    user_id bigint references users(id), 
 *    name text, 
 *    items text, -- Armazena o JSON dos itens como string ou use o tipo JSONB
 *    created_at timestamp with time zone default now()
 * );
 * 
 * alter table saved_lists disable row level security;
 */

const SUPABASE_URL = 'https://zagebrolhkzdqezmijdi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8PbA4ZgMUEYzTRzGhyvMzA_5xebA4Tu';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

class Database {
    async query(table: string, action: 'SELECT' | 'INSERT' | 'DELETE' | 'UPDATE', params: any = null): Promise<any[]> {
        try {
            if (action === 'SELECT') {
                let query = supabase.from(table).select('*');
                if (params && params.eq && params.eq[1] !== undefined && params.eq[1] !== null) {
                    query = query.eq(params.eq[0], params.eq[1]);
                }
                if (['cities', 'markets', 'categories', 'products', 'users'].includes(table)) {
                    query = query.order('name', { ascending: true });
                } else if (table === 'prices') {
                    query = query.order('market', { ascending: true }).order('product', { ascending: true });
                } else if (table === 'saved_lists') {
                    query = query.order('created_at', { ascending: false });
                }

                const { data, error } = await query;
                if (error) {
                    if (error.code === '42P01') showToast(`Erro: Tabela '${table}' não existe.`);
                    throw error;
                }
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
        } catch (err: any) {
            console.error(`Erro SQL (${action} em ${table}):`, err.message);
            throw err; 
        }
        return [];
    }
}

const db = new Database();

// --- APP STATE ---
let currentUser: any = null;
let shoppingList: { name: string, quantity: number }[] = [];
let currentListId: any = null; 
let html5QrCode: any = null;

// --- HELPERS ---
const formatPrice = (val: any): string => {
    const num = parseFloat(val);
    return isNaN(num) ? "0,00" : num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (iso: string): string => {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString('pt-BR');
};

const showToast = (m: string) => {
    const t = document.getElementById('toast');
    const tx = document.getElementById('toast-text');
    if (t && tx) { 
        tx.textContent = m; 
        t.classList.remove('translate-y-32'); 
        setTimeout(() => t.classList.add('translate-y-32'), 5000); 
    }
};

// --- SCANNER LOGIC ---
const startScanner = async (targetId: string = 'product-barcode') => {
    const container = document.getElementById('scanner-container');
    if (container) container.classList.remove('hidden');
    html5QrCode = new (window as any).Html5Qrcode("reader");
    try {
        await html5QrCode.start({ facingMode: "environment" }, { fps: 15, qrbox: { width: 250, height: 150 } }, (decodedText: string) => {
            const barcodeInput = document.getElementById(targetId) as HTMLInputElement;
            if (barcodeInput) {
                barcodeInput.value = decodedText;
                showToast("Código Identificado");
                if (targetId === 'quick-search-barcode') (window as any).lookupBarcode(decodedText);
                stopScanner();
            }
        }, () => {});
    } catch (err) { showToast("Câmera indisponível"); }
};
(window as any).startScanner = startScanner;

const stopScanner = async () => {
    if (html5QrCode) {
        try { await html5QrCode.stop(); } catch(e) {}
        html5QrCode = null;
    }
    document.getElementById('scanner-container')?.classList.add('hidden');
};
(window as any).stopScanner = stopScanner;

// --- QUICK SEARCH LOGIC ---
(window as any).lookupBarcode = async (barcode: string) => {
    const nameInput = document.getElementById('quick-search-product-name') as HTMLInputElement;
    if (!barcode) { if (nameInput) nameInput.value = ""; return; }
    const products = await db.query('products', 'SELECT');
    const product = products.find(p => p.barcode?.toString() === barcode.toString());
    if (nameInput) nameInput.value = product ? product.name : "Produto não encontrado";
};

(window as any).runQuickComparison = async () => {
    const nameInput = document.getElementById('quick-search-product-name') as HTMLInputElement;
    const prodName = nameInput?.value;
    if (!prodName || prodName === "Produto não encontrado" || prodName === "Aguardando código...") return showToast("Selecione um produto válido");
    const res = document.getElementById('quick-comparison-results');
    if (!res) return;
    res.classList.remove('hidden');
    const prices = await db.query('prices', 'SELECT');
    const relevantPrices = prices.filter(p => p.product === prodName).sort((a, b) => a.price - b.price);
    let html = `<div class="bg-white rounded-[2rem] border border-slate-100 p-8 space-y-4 animate-in"><h3 class="font-bold text-slate-800">Menores Preços para: ${prodName}</h3><div class="space-y-2">`;
    if (relevantPrices.length === 0) html += `<p class="text-sm text-slate-400 italic">Nenhum preço cadastrado.</p>`;
    else relevantPrices.forEach(p => { html += `<div class="flex justify-between items-center p-4 bg-slate-50 rounded-2xl"><span class="text-sm font-bold text-slate-700">${p.market}</span><span class="text-lg font-black text-emerald-600">R$ ${formatPrice(p.price)}</span></div>`; });
    html += `</div></div>`;
    res.innerHTML = html;
};

// --- INIT & NAVIGATION ---
document.addEventListener('DOMContentLoaded', checkSession);

function checkSession() {
    const session = localStorage.getItem('app_session');
    if (session) { currentUser = JSON.parse(session); renderApp(); }
}

const showView = async (vId: string) => {
    document.querySelectorAll('#main-app main > div').forEach(d => d.classList.add('hidden'));
    const t = document.getElementById(`view-${vId}`);
    if (t) {
        t.classList.remove('hidden');
        if (vId === 'home') loadHome();
        if (vId === 'saved-lists') renderSavedLists();
        if (vId === 'build-list') loadBuildList();
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
    if (hN) hN.textContent = currentUser.name;
    if (hC) hC.textContent = currentUser.city;
    document.getElementById('nav-admin')?.classList.toggle('hidden', currentUser.name !== 'administrador');
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
            showToast('Conta criada!'); (window as any).setAuthMode('login');
        } else {
            const users = await db.query('users', 'SELECT');
            const u = users.find(u => u.name === uIn && u.password === pIn);
            if (u) { currentUser = u; localStorage.setItem('app_session', JSON.stringify(u)); renderApp(); }
            else showToast('Acesso negado');
        }
    };
}

(window as any).setAuthMode = async (mode: string) => {
    document.getElementById('btn-tab-login')?.classList.toggle('bg-white', mode === 'login');
    document.getElementById('btn-tab-register')?.classList.toggle('bg-white', mode === 'register');
    document.getElementById('register-fields')?.classList.toggle('hidden', mode === 'login');
    if (mode === 'register') populateDropdown('auth-city', 'cities');
};

// --- SAVED LISTS ---
async function renderSavedLists() {
    const container = document.getElementById('saved-lists-container');
    if (!container) return;
    container.innerHTML = `<div class="col-span-full py-20 text-center"><p class="text-slate-400 animate-pulse font-bold uppercase text-xs">Buscando listas...</p></div>`;
    
    if (!currentUser?.id) return showToast("Sessão inválida");
    
    try {
        const lists = await db.query('saved_lists', 'SELECT', { eq: ['user_id', currentUser.id] });
        
        if (!lists.length) {
            container.innerHTML = `<div class="col-span-full py-20 text-center space-y-4">
                <p class="text-slate-400 font-bold uppercase text-xs">Nenhuma lista salva encontrada.</p>
                <button onclick="showView('build-list')" class="px-6 py-3 bg-emerald-100 text-emerald-700 rounded-2xl text-[10px] font-bold uppercase tracking-widest">Criar Lista</button>
            </div>`;
            return;
        }

        container.innerHTML = lists.map(list => {
            return `
            <div class="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6 hover:border-emerald-500 transition-all group animate-in">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="font-bold text-slate-800 text-lg">${list.name}</h3>
                        <p class="text-[10px] text-slate-400 font-bold uppercase">Criada em: ${formatDate(list.created_at)}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="editList(${list.id})" class="p-2 text-blue-500 hover:bg-blue-50 rounded-xl" title="Editar"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                        <button onclick="deleteList(${list.id})" class="p-2 text-red-500 hover:bg-red-50 rounded-xl" title="Excluir"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    </div>
                </div>
                <button onclick="loadListToCompare(${list.id})" class="w-full py-4 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all">Ver Comparação de Preços</button>
            </div>`;
        }).join('');
    } catch(e: any) { 
        container.innerHTML = `<div class="col-span-full py-20 text-center space-y-4">
            <p class="text-red-500 font-bold uppercase text-xs">Erro ao carregar banco de dados</p>
            <p class="text-[10px] text-slate-400 font-medium px-10">${e.message || 'Verifique as permissões da tabela saved_lists'}</p>
            <button onclick="renderSavedLists()" class="text-emerald-600 font-bold text-[10px] underline">Tentar novamente</button>
        </div>`;
    }
}

(window as any).editList = async (id: any) => {
    try {
        const listData = await db.query('saved_lists', 'SELECT', { eq: ['id', id] });
        const list = listData[0];
        if (!list) return;
        currentListId = id;
        shoppingList = typeof list.items === 'string' ? JSON.parse(list.items || '[]') : (list.items || []);
        showView('build-list');
        setTimeout(() => { (document.getElementById('input-list-name') as HTMLInputElement).value = list.name; }, 100);
    } catch(e) { showToast("Erro ao carregar dados da lista"); }
};

(window as any).deleteList = async (id: any) => {
    if (confirm('Deseja realmente excluir esta lista permanentemente?')) {
        try {
            await db.query('saved_lists', 'DELETE', id);
            showToast('Lista excluída');
            renderSavedLists();
        } catch(e) { showToast("Erro ao excluir"); }
    }
};

(window as any).loadListToCompare = async (id: any) => {
    try {
        const listData = await db.query('saved_lists', 'SELECT', { eq: ['id', id] });
        if (listData[0]) {
            const list = listData[0];
            shoppingList = typeof list.items === 'string' ? JSON.parse(list.items || '[]') : (list.items || []);
            showView('build-list');
            setTimeout(() => (window as any).runComparison(), 200);
        }
    } catch(e) { showToast("Erro ao carregar comparação"); }
};

// --- BUILD LIST LOGIC ---
function loadHome() {
    currentListId = null;
    shoppingList = [];
    document.getElementById('comparison-results')?.classList.add('hidden');
}

function loadBuildList() {
    populateDropdown('select-category', 'categories');
    updateListDisplay();
    if (!currentListId) {
        const nameIn = document.getElementById('input-list-name') as HTMLInputElement;
        if (nameIn) nameIn.value = "";
    }
}

(window as any).addItem = () => {
    const pSel = document.getElementById('select-product') as HTMLSelectElement;
    const qIn = document.getElementById('select-quantity') as HTMLInputElement;
    if (pSel.disabled || !pSel.value) return;
    const existing = shoppingList.find(i => i.name === pSel.value);
    const qty = parseInt(qIn.value) || 1;
    if (existing) existing.quantity += qty;
    else shoppingList.push({ name: pSel.value, quantity: qty });
    qIn.value = "1";
    updateListDisplay();
};

function updateListDisplay() {
    const c = document.getElementById('shopping-list-container');
    if (!c) return;
    c.innerHTML = shoppingList.map(item => `
        <div class="flex justify-between items-center p-6 bg-slate-50 rounded-2xl animate-in">
            <div class="flex items-center gap-4">
                <span class="w-10 h-10 bg-white text-slate-800 flex items-center justify-center rounded-xl text-xs font-black shadow-sm">${item.quantity}</span>
                <span class="font-bold text-slate-700">${item.name}</span>
            </div>
            <div class="flex gap-2">
                <button onclick="editItem('${item.name}')" class="text-slate-300 hover:text-blue-500 transition-colors" title="Editar item">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button onclick="removeItem('${item.name}')" class="text-slate-300 hover:text-red-500 transition-colors" title="Excluir item">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </div>
        </div>`).join('');
    document.getElementById('action-list-tools')?.classList.toggle('hidden', !shoppingList.length);
}

(window as any).editItem = async (name: string) => {
    const item = shoppingList.find(i => i.name === name);
    if (!item) return;

    try {
        const products = await db.query('products', 'SELECT');
        const product = products.find(p => p.name === name);

        if (product) {
            const catSel = document.getElementById('select-category') as HTMLSelectElement;
            const qIn = document.getElementById('select-quantity') as HTMLInputElement;

            catSel.value = product.category;
            await (window as any).onCategoryChangeHome();

            const pSel = document.getElementById('select-product') as HTMLSelectElement;
            pSel.value = name;
            qIn.value = item.quantity.toString();

            // Remove o item da lista para que o usuário possa re-adicioná-lo após o ajuste
            shoppingList = shoppingList.filter(i => i.name !== name);
            updateListDisplay();
            showToast("Item carregado para edição");
        }
    } catch (e) { showToast("Erro ao carregar dados do produto"); }
};

(window as any).removeItem = (name: string) => {
    shoppingList = shoppingList.filter(i => i.name !== name);
    updateListDisplay();
};

(window as any).saveList = async () => {
    const nameInput = document.getElementById('input-list-name') as HTMLInputElement;
    if (!nameInput.value.trim()) return showToast('Dê um nome para a lista');
    if (!shoppingList.length) return showToast('Adicione itens antes de salvar');
    
    const data = { 
        user_id: currentUser.id, 
        name: nameInput.value, 
        items: JSON.stringify(shoppingList), 
        created_at: new Date().toISOString() 
    };

    try {
        if (currentListId) await db.query('saved_lists', 'UPDATE', { id: currentListId, data });
        else await db.query('saved_lists', 'INSERT', data);
        showToast('Lista Salva!');
        showView('home');
    } catch(e) { showToast("Erro ao salvar lista no banco"); }
};

// --- COMPARISON ---
(window as any).runComparison = async () => {
    const res = document.getElementById('comparison-results');
    if (!res) return;
    try {
        const markets = await db.query('markets', 'SELECT');
        const prices = await db.query('prices', 'SELECT');
        let totals: any = {};
        markets.forEach(m => totals[m.name] = 0);
        
        let html = `<div class="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden animate-in">
            <div class="p-8 bg-slate-50 border-b"><h3 class="font-extrabold text-slate-900 uppercase text-sm">Painel Comparativo</h3></div>
            <div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-white text-[10px] font-bold uppercase text-slate-400"><tr><th class="p-6">Lista</th>${markets.map(m => `<th class="p-6 text-center">${m.name}</th>`).join('')}</tr></thead><tbody class="divide-y divide-slate-50 text-sm">`;
        
        shoppingList.forEach(item => {
            html += `<tr><td class="p-6 font-medium text-slate-600"><span class="font-bold text-slate-900">${item.name}</span> (x${item.quantity})</td>`;
            markets.forEach(m => {
                const pObj = prices.find(p => p.market === m.name && p.product === item.name);
                const line = (pObj ? parseFloat(pObj.price) : 0) * item.quantity;
                totals[m.name] += line;
                html += `<td class="p-6 text-center font-bold text-slate-800">R$ ${formatPrice(line)}</td>`;
            });
            html += `</tr>`;
        });

        const valid = Object.values(totals).filter((v: any) => v > 0);
        const min = valid.length ? Math.min(...(valid as number[])) : 0;
        
        html += `<tr class="bg-slate-900 text-white font-bold"><td class="p-8">TOTAL</td>`;
        markets.forEach(m => {
            const isBest = totals[m.name] > 0 && totals[m.name] === min;
            html += `<td class="p-8 text-center ${isBest ? 'bg-emerald-600' : ''}">R$ ${formatPrice(totals[m.name])} ${isBest ? '🏆' : ''}</td>`;
        });
        html += `</tr></tbody></table></div></div>`;
        res.innerHTML = html; 
        res.classList.remove('hidden'); 
        res.scrollIntoView({ behavior: 'smooth' });
    } catch(e) { showToast("Erro ao processar comparação"); }
};

// --- ADMIN RENDERERS ---
async function renderAdminUsers() {
    populateDropdown('user-admin-city', 'cities');
    const users = await db.query('users', 'SELECT');
    document.getElementById('table-users-body')!.innerHTML = users.map(u => `<tr class="border-b"> <td class="p-6 font-bold">${u.name}</td> <td class="p-6 text-slate-500">${u.email || '-'}</td> <td class="p-6">${u.city || '-'}</td> <td class="p-6 text-slate-400">${formatDate(u.created_at)}</td> <td class="p-6 text-right"><button onclick="editUser(${u.id})" class="text-emerald-600 font-bold text-[10px]">Editar</button></td> </tr>`).join('');
}
async function renderAdminCities() {
    const cities = await db.query('cities', 'SELECT');
    document.getElementById('table-cities-body')!.innerHTML = cities.map(c => `<tr class="border-b"> <td class="p-6 font-bold">${c.name}</td> <td class="p-6">${c.state}</td> <td class="p-6 text-right"><button onclick="editCity(${c.id})" class="text-emerald-600 font-bold text-[10px]">Editar</button></td> </tr>`).join('');
}
async function renderAdminMarkets() {
    populateDropdown('market-city', 'cities');
    const markets = await db.query('markets', 'SELECT');
    document.getElementById('table-markets-body')!.innerHTML = markets.map(m => `<tr class="border-b"> <td class="p-6 font-bold">${m.name}</td> <td class="p-6">${m.city}</td> <td class="p-6">${m.bairro}</td> <td class="p-6 text-right"><button onclick="editMarket(${m.id})" class="text-emerald-600 font-bold text-[10px]">Editar</button></td> </tr>`).join('');
}
async function renderAdminCategories() {
    const cats = await db.query('categories', 'SELECT');
    document.getElementById('table-categories-body')!.innerHTML = cats.map(c => `<tr class="border-b"> <td class="p-6 font-bold">${c.name}</td> <td class="p-6 text-right"><button onclick="editCategory(${c.id})" class="text-emerald-600 font-bold text-[10px]">Editar</button></td> </tr>`).join('');
}
async function renderAdminProducts() {
    populateDropdown('product-category', 'categories');
    const prods = await db.query('products', 'SELECT');
    document.getElementById('table-products-body')!.innerHTML = prods.map(p => `<tr class="border-b"> <td class="p-6 font-bold">${p.name}</td> <td class="p-6">${p.category}</td> <td class="p-6 text-slate-400 font-mono text-[10px]">${p.barcode || '-'}</td> <td class="p-6 text-right"><button onclick="editProduct(${p.id})" class="text-emerald-600 font-bold text-[10px]">Editar</button></td> </tr>`).join('');
}
async function renderAdminPrices() {
    populateDropdown('price-market', 'markets');
    populateDropdown('price-category', 'categories');
    const prcs = await db.query('prices', 'SELECT');
    document.getElementById('table-prices-body')!.innerHTML = prcs.map(p => `<tr class="border-b"> <td class="p-6 font-bold text-emerald-600">R$ ${formatPrice(p.price)}</td> <td class="p-6">${p.market}</td> <td class="p-6">${p.product}</td> <td class="p-6 text-right"><button onclick="editPrice(${p.id})" class="text-emerald-600 font-bold text-[10px]">Editar</button></td> </tr>`).join('');
}

// --- UTILS & FORM SETUP ---
async function populateDropdown(id: string, table: string) {
    const el = document.getElementById(id) as HTMLSelectElement;
    if (!el) return;
    const data = await db.query(table, 'SELECT');
    el.innerHTML = '<option value="">Selecionar...</option>' + data.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
}

(window as any).onCategoryChangeHome = async () => {
    const cat = (document.getElementById('select-category') as HTMLSelectElement).value;
    const pSel = document.getElementById('select-product') as HTMLSelectElement;
    pSel.disabled = !cat;
    if (cat) {
        const prods = await db.query('products', 'SELECT');
        pSel.innerHTML = prods.filter(p => p.category === cat).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    }
};

(window as any).onCategoryChangePrice = async () => {
    const cat = (document.getElementById('price-category') as HTMLSelectElement).value;
    const pSel = document.getElementById('price-product') as HTMLSelectElement;
    pSel.disabled = !cat;
    if (cat) {
        const prods = await db.query('products', 'SELECT');
        pSel.innerHTML = prods.filter(p => p.category === cat).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    }
};

const setupForm = (id: string, table: string, fields: string[], callback?: Function) => {
    const f = document.getElementById(id);
    if (!f) return;
    f.onsubmit = async (e) => {
        e.preventDefault();
        const data: any = {};
        let idBase = table === 'cities' ? 'city' : table.slice(0, -1);
        if (id.includes('user')) idBase = 'user-admin';
        const editId = (document.getElementById(`${idBase}-id`) as HTMLInputElement)?.value;
        fields.forEach(fid => {
            const el = document.getElementById(fid) as any;
            if (el) {
                let val = el.value;
                if (fid.includes('price') && fid.endsWith('price')) val = parseFloat(val) || 0;
                data[fid.split('-').pop()!] = val;
            }
        });
        if (editId) await db.query(table, 'UPDATE', { id: editId, data });
        else await db.query(table, 'INSERT', data);
        showToast('Sucesso!'); (e.target as HTMLFormElement).reset(); if (callback) callback();
    };
};

setupForm('form-city', 'cities', ['input-city-name', 'input-city-state'], renderAdminCities);
setupForm('form-market', 'markets', ['market-name', 'market-city', 'market-bairro'], renderAdminMarkets);
setupForm('form-category', 'categories', ['category-name'], renderAdminCategories);
setupForm('form-product', 'products', ['product-name', 'product-category', 'product-barcode'], renderAdminProducts);
setupForm('form-price', 'prices', ['price-market', 'price-category', 'price-product', 'price-price'], renderAdminPrices);
setupForm('form-user-admin', 'users', ['user-admin-name', 'user-admin-email', 'user-admin-city', 'user-admin-password'], renderAdminUsers);

// --- EDIT HANDLERS ---
(window as any).editCity = (id: any) => db.query('cities', 'SELECT').then(data => { const x = data.find(i => i.id == id); if (x) { (document.getElementById('city-id') as any).value = x.id; (document.getElementById('input-city-name') as any).value = x.name; (document.getElementById('input-city-state') as any).value = x.state; } });
(window as any).editMarket = (id: any) => db.query('markets', 'SELECT').then(data => { const x = data.find(i => i.id == id); if (x) { (document.getElementById('market-id') as any).value = x.id; (document.getElementById('market-name') as any).value = x.name; (document.getElementById('market-city') as any).value = x.city; (document.getElementById('market-bairro') as any).value = x.bairro; } });
(window as any).editCategory = (id: any) => db.query('categories', 'SELECT').then(data => { const x = data.find(i => i.id == id); if (x) { (document.getElementById('category-id') as any).value = x.id; (document.getElementById('category-name') as any).value = x.name; } });
(window as any).editProduct = (id: any) => db.query('products', 'SELECT').then(data => { const x = data.find(i => i.id == id); if (x) { (document.getElementById('product-id') as any).value = x.id; (document.getElementById('product-category') as any).value = x.category; (document.getElementById('product-name') as any).value = x.name; (document.getElementById('product-barcode') as any).value = x.barcode || ''; } });
(window as any).editPrice = async (id: any) => { const prices = await db.query('prices', 'SELECT'); const p = prices.find(i => i.id == id); if (p) { (document.getElementById('price-id') as any).value = p.id; (document.getElementById('price-market') as any).value = p.market; (document.getElementById('price-category') as any).value = p.category; await (window as any).onCategoryChangePrice(); (document.getElementById('price-product') as any).value = p.product; (document.getElementById('price-price') as any).value = p.price; } };
(window as any).editUser = (id: any) => db.query('users', 'SELECT').then(data => { const x = data.find(i => i.id == id); if (x) { (document.getElementById('user-admin-id') as any).value = x.id; (document.getElementById('user-admin-name') as any).value = x.name; (document.getElementById('user-admin-email') as any).value = x.email || ''; (document.getElementById('user-admin-city') as any).value = x.city || ''; (document.getElementById('user-admin-password') as any).value = x.password; } });
