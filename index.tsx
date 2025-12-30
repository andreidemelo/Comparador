
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
                } else if (table === 'saved_lists') {
                    query = query.order('created_at', { ascending: false });
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
        } catch (err: any) {
            const errorMsg = err.message || JSON.stringify(err);
            console.error(`Erro na operação ${action} em ${table}:`, errorMsg);
            showToast(`Erro DB: ${errorMsg}`);
            return [];
        }
        return [];
    }
}

const db = new Database();

// --- APP STATE ---
let currentUser: any = null;
let shoppingList: { name: string, quantity: number }[] = [];
let openedListId: number | null = null; // Rastreia qual lista está aberta para edição

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

function showToast(m: string) {
    const t = document.getElementById('toast');
    const tx = document.getElementById('toast-text');
    if (t && tx) { 
        tx.textContent = m; 
        t.classList.remove('translate-y-32'); 
        setTimeout(() => t.classList.add('translate-y-32'), 3500); 
    }
}

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

// --- NAVIGATION ---
const showView = async (vId: string) => {
    document.querySelectorAll('#main-app main > div').forEach(d => d.classList.add('hidden'));
    const t = document.getElementById(`view-${vId}`);
    if (t) {
        t.classList.remove('hidden');
        if (vId === 'home') loadHome();
        if (vId === 'admin-users') loadAdminUsers();
        if (vId === 'admin-cities') loadAdminCities();
        if (vId === 'admin-markets') loadAdminMarkets();
        if (vId === 'admin-categories') loadAdminCategories();
        if (vId === 'admin-products') loadAdminProducts();
        if (vId === 'admin-prices') loadAdminPrices();
    }
};
(window as any).showView = showView;

// --- SAVED LISTS LOGIC ---
async function renderSavedLists() {
    const container = document.getElementById('saved-lists-container');
    if (!container) return;
    
    const lists = await db.query('saved_lists', 'SELECT');
    const userLists = lists.filter(l => l.user_id === currentUser.id);

    if (userLists.length === 0) {
        container.innerHTML = `<p class="text-[10px] font-bold text-slate-300 uppercase italic col-span-full">Nenhuma lista salva ainda...</p>`;
        return;
    }

    container.innerHTML = userLists.map(list => `
        <div class="list-card p-6 rounded-[1.5rem] flex flex-col justify-between h-full animate-in">
            <div>
                <h3 class="font-bold text-slate-800 text-sm mb-1">${list.name}</h3>
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">${formatDate(list.created_at)} • ${list.items.length} itens</p>
            </div>
            <div class="flex gap-4 mt-6">
                <button onclick="loadSavedList(${list.id})" class="text-emerald-600 text-[10px] font-bold uppercase tracking-widest hover:underline">Abrir Lista</button>
                <button onclick="deleteSavedList(${list.id})" class="text-red-400 text-[10px] font-bold uppercase tracking-widest hover:underline">Excluir</button>
            </div>
        </div>
    `).join('');
}

(window as any).loadSavedList = async (id: number) => {
    const lists = await db.query('saved_lists', 'SELECT');
    const list = lists.find(l => l.id === id);
    if (!list) return;

    shoppingList = [...list.items];
    openedListId = id; // Marca como lista aberta
    
    updateListDisplay();
    document.getElementById('comparison-results')?.classList.add('hidden');
    showToast(`Lista "${list.name}" carregada para edição!`);
    document.getElementById('shopping-list-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

(window as any).deleteSavedList = async (id: number) => {
    if (confirm('Deseja excluir esta lista permanentemente?')) {
        await db.query('saved_lists', 'DELETE', id);
        if (openedListId === id) openedListId = null;
        renderSavedLists();
        showToast("Lista removida");
    }
};

// --- LOGICA PARA SALVAR OU ATUALIZAR ---
const openListNameModal = () => {
    if (shoppingList.length === 0) {
        showToast("Adicione itens à sua lista primeiro");
        return;
    }
    const modal = document.getElementById('modal-list-name');
    const input = document.getElementById('input-new-list-name') as HTMLInputElement;
    if (modal && input) {
        modal.style.display = 'flex';
        input.value = "";
        input.focus();
    }
};
(window as any).openListNameModal = openListNameModal;

const closeListNameModal = () => {
    const modal = document.getElementById('modal-list-name');
    if (modal) modal.style.display = 'none';
};
(window as any).closeListNameModal = closeListNameModal;

const confirmUpdateList = async () => {
    if (!openedListId) return;

    const lists = await db.query('saved_lists', 'SELECT');
    const original = lists.find(l => l.id === openedListId);
    if (!original) return;

    const updateData = {
        items: shoppingList,
        created_at: new Date().toISOString() // Atualiza a data conforme solicitado
    };

    const res = await db.query('saved_lists', 'UPDATE', { id: openedListId, data: updateData });
    
    if (res && res.length > 0) {
        showToast(`Lista "${original.name}" atualizada com sucesso!`);
        
        // LIMPEZA DA TELA APÓS ATUALIZAR
        shoppingList = [];
        openedListId = null;
        updateListDisplay();
        document.getElementById('comparison-results')?.classList.add('hidden');
        
        renderSavedLists();
    } else {
        showToast("Erro ao atualizar lista.");
    }
};
(window as any).confirmUpdateList = confirmUpdateList;

(window as any).handleSaveAction = () => {
    if (openedListId) {
        // Se já existe uma lista aberta, atualiza direto
        confirmUpdateList();
    } else {
        // Se não, abre o modal para nomear nova lista
        openListNameModal();
    }
};

const confirmSaveList = async () => {
    const input = document.getElementById('input-new-list-name') as HTMLInputElement;
    const name = input?.value.trim();

    if (!name) {
        showToast("Por favor, digite um nome para a lista");
        return;
    }

    const newList = {
        user_id: currentUser.id,
        name: name,
        items: shoppingList,
        created_at: new Date().toISOString()
    };

    const res = await db.query('saved_lists', 'INSERT', newList);
    
    if (res && res.length > 0) {
        showToast("Nova lista salva com sucesso!");
        
        // Também limpamos após salvar uma nova lista para manter a consistência
        shoppingList = [];
        openedListId = null;
        updateListDisplay();
        document.getElementById('comparison-results')?.classList.add('hidden');
        
        closeListNameModal();
        renderSavedLists();
    } else {
        showToast("Erro ao conectar com o banco de dados.");
    }
};
(window as any).confirmSaveList = confirmSaveList;

// --- HOME LOGIC ---
async function loadHome() {
    populateDropdown('select-category', 'categories');
    renderSavedLists();
    updateListDisplay();
}

(window as any).onCategoryChangeHome = async () => {
    const cat = (document.getElementById('select-category') as HTMLSelectElement).value;
    const pSel = document.getElementById('select-product') as HTMLSelectElement;
    if (!cat) { pSel.disabled = true; pSel.innerHTML = '<option value="">...</option>'; return; }
    pSel.disabled = false;
    const products = await db.query('products', 'SELECT');
    const prods = products.filter(p => p.category === cat);
    pSel.innerHTML = '<option value="">Selecionar...</option>' + prods.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
};

(window as any).changeQuantity = (delta: number) => {
    const qIn = document.getElementById('select-quantity') as HTMLInputElement;
    if (!qIn) return;
    let val = parseInt(qIn.value) || 1;
    val += delta;
    if (val < 1) val = 1;
    qIn.value = val.toString();
};

(window as any).addItem = () => {
    const catSel = document.getElementById('select-category') as HTMLSelectElement;
    const pSel = document.getElementById('select-product') as HTMLSelectElement;
    const qIn = document.getElementById('select-quantity') as HTMLInputElement;
    
    if (pSel.disabled || !pSel.value) {
        showToast("Selecione um produto");
        return;
    }
    
    const prodName = pSel.value;
    const quantity = parseInt(qIn.value) || 1;
    
    const existing = shoppingList.find(i => i.name === prodName);
    if (existing) {
        existing.quantity += quantity;
    } else {
        shoppingList.push({ name: prodName, quantity });
    }
    
    catSel.value = "";
    pSel.value = "";
    pSel.disabled = true;
    pSel.innerHTML = '<option value="">...</option>';
    qIn.value = "1";
    
    updateListDisplay();
    showToast("Item adicionado");
};

(window as any).editItem = async (name: string) => {
    const item = shoppingList.find(i => i.name === name);
    if (!item) return;

    shoppingList = shoppingList.filter(i => i.name !== name);
    
    const products = await db.query('products', 'SELECT');
    const prod = products.find(p => p.name === name);
    
    if (prod) {
        const catSel = document.getElementById('select-category') as HTMLSelectElement;
        const qIn = document.getElementById('select-quantity') as HTMLInputElement;
        
        catSel.value = prod.category;
        await (window as any).onCategoryChangeHome();
        
        const pSel = document.getElementById('select-product') as HTMLSelectElement;
        pSel.value = name;
        qIn.value = item.quantity.toString();
        
        showToast(`Ajustando: ${name}`);
        document.getElementById('select-category')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    updateListDisplay();
};

function updateListDisplay() {
    const c = document.getElementById('shopping-list-container');
    const a = document.getElementById('action-compare');
    if (!c) return;
    
    c.innerHTML = shoppingList.map(item => `
        <div class="group flex justify-between items-center p-5 bg-white rounded-2xl border border-slate-100 hover:border-emerald-200 transition-all animate-in shadow-sm">
            <div class="flex items-center gap-3">
                <div class="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-black ring-1 ring-emerald-100">
                    x${item.quantity}
                </div>
                <span class="font-bold text-slate-700 text-sm">${item.name}</span>
            </div>
            <div class="flex items-center gap-1">
                <button onclick="editItem('${item.name}')" class="p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all" title="Alterar">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button onclick="removeItem('${item.name}')" class="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title="Excluir">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </div>
        </div>
    `).join('');
    
    a?.classList.toggle('hidden', shoppingList.length === 0);

    // Atualiza o título da seção dinamicamente
    const titleEl = document.getElementById('section-list-title');
    if (titleEl) {
        titleEl.textContent = openedListId ? "Atualize sua Lista de Compras" : "Monte sua Lista de Compras";
    }

    // Atualiza o botão de salvar/atualizar na interface principal
    const saveBtn = document.querySelector('#action-compare button:first-child');
    if (saveBtn) {
        saveBtn.textContent = openedListId ? "Atualizar Lista" : "Salvar Lista";
        saveBtn.setAttribute('onclick', "handleSaveAction()");
    }
}

(window as any).removeItem = (name: string) => {
    shoppingList = shoppingList.filter(i => i.name !== name);
    updateListDisplay();
};

// --- COMPARISON LOGIC ---
(window as any).runComparison = async () => {
    const res = document.getElementById('comparison-results');
    const markets = await db.query('markets', 'SELECT');
    const prices = await db.query('prices', 'SELECT');
    if (!res) return;

    let html = `
        <div class="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden animate-in">
            <div class="p-8 bg-slate-50/50 border-b flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h3 class="font-extrabold text-slate-900 tracking-tight uppercase text-sm">Painel Comparativo</h3>
                    <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Valores atualizados em tempo real</p>
                </div>
                <div class="flex gap-3">
                    <button onclick="handleSaveAction()" class="bg-emerald-600 text-white px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-50">${openedListId ? 'Atualizar Lista' : 'Salvar Lista'}</button>
                    <button onclick="window.print()" class="bg-white text-slate-800 px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest border border-slate-100 shadow-sm hover:bg-slate-50 transition-all">Imprimir</button>
                </div>
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

// --- AUTH & UTILS (MANTIDOS) ---
(window as any).logout = () => { localStorage.removeItem('app_session'); location.reload(); };

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

const authForm = document.getElementById('form-auth');
if (authForm) {
    authForm.onsubmit = async (e) => {
        e.preventDefault();
        const uIn = (document.getElementById('auth-username') as HTMLInputElement).value;
        const pIn = (document.getElementById('auth-password') as HTMLInputElement).value;
        const isLogin = (document.getElementById('btn-tab-login')?.classList.contains('bg-white'));

        if (!isLogin) {
            const eIn = (document.getElementById('auth-email') as HTMLInputElement).value;
            const cIn = (document.getElementById('auth-city') as HTMLSelectElement).value;
            const res = await db.query('users', 'INSERT', { name: uIn, email: eIn, city: cIn, password: pIn });
            if (res && res.length > 0) {
                showToast('Conta criada!'); 
                (window as any).setAuthMode('login');
            }
        } else {
            const users = await db.query('users', 'SELECT');
            const u = users.find(u => u.name === uIn && u.password === pIn);
            if (u) { 
                currentUser = u; 
                localStorage.setItem('app_session', JSON.stringify(u)); 
                renderApp(); 
            } else { 
                showToast('Acesso negado'); 
            }
        }
    };
}

async function populateDropdown(id: string, table: string) {
    const el = document.getElementById(id) as HTMLSelectElement;
    if (!el) return;
    const data = await db.query(table, 'SELECT');
    el.innerHTML = '<option value="">Selecionar...</option>';
    el.innerHTML += data.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
}

async function loadAdminUsers() { 
    const data = await db.query('users', 'SELECT');
    const tbody = document.getElementById('table-users-body');
    if (tbody) tbody.innerHTML = data.map(u => `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="p-6 font-bold text-slate-700">${u.name}</td>
            <td class="p-6 text-slate-500">${u.email || '-'}</td>
            <td class="p-6 text-slate-500">${u.city || '-'}</td>
            <td class="p-6 text-slate-500 text-right">
                <button onclick="deleteItem('users', ${u.id}, loadAdminUsers)" class="text-red-400 hover:text-red-600 font-bold uppercase text-[9px] tracking-widest">Excluir</button>
            </td>
        </tr>
    `).join('');
}
async function loadAdminCities() { 
    const data = await db.query('cities', 'SELECT');
    const tbody = document.getElementById('table-cities-body');
    if (tbody) tbody.innerHTML = data.map(c => `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="p-6 font-bold text-slate-700">${c.name}</td>
            <td class="p-6 text-slate-500 uppercase">${c.state}</td>
            <td class="p-6 text-right">
                <button onclick="deleteItem('cities', ${c.id}, loadAdminCities)" class="text-red-400 hover:text-red-600 font-bold uppercase text-[9px] tracking-widest">Excluir</button>
            </td>
        </tr>
    `).join('');
}
async function loadAdminMarkets() { 
    const data = await db.query('markets', 'SELECT');
    const tbody = document.getElementById('table-markets-body');
    if (tbody) tbody.innerHTML = data.map(m => `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="p-6 font-bold text-slate-700">${m.name}</td>
            <td class="p-6 text-slate-500">${m.city}</td>
            <td class="p-6 text-slate-500">${m.bairro}</td>
            <td class="p-6 text-right">
                <button onclick="deleteItem('markets', ${m.id}, loadAdminMarkets)" class="text-red-400 hover:text-red-600 font-bold uppercase text-[9px] tracking-widest">Excluir</button>
            </td>
        </tr>
    `).join('');
}
async function loadAdminCategories() { 
    const data = await db.query('categories', 'SELECT');
    const tbody = document.getElementById('table-categories-body');
    if (tbody) tbody.innerHTML = data.map(c => `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="p-6 font-bold text-slate-700">${c.name}</td>
            <td class="p-6 text-right">
                <button onclick="deleteItem('categories', ${c.id}, loadAdminCategories)" class="text-red-400 hover:text-red-600 font-bold uppercase text-[9px] tracking-widest">Excluir</button>
            </td>
        </tr>
    `).join('');
}
async function loadAdminProducts() { 
    const data = await db.query('products', 'SELECT');
    const tbody = document.getElementById('table-products-body');
    if (tbody) tbody.innerHTML = data.map(p => `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="p-6 font-bold text-slate-700">${p.name}</td>
            <td class="p-6 text-slate-500">${p.category}</td>
            <td class="p-6 text-slate-500 font-mono">${p.barcode || '-'}</td>
            <td class="p-6 text-right">
                <button onclick="deleteItem('products', ${p.id}, loadAdminProducts)" class="text-red-400 hover:text-red-600 font-bold uppercase text-[9px] tracking-widest">Excluir</button>
            </td>
        </tr>
    `).join('');
}
async function loadAdminPrices() { 
    const data = await db.query('prices', 'SELECT');
    const tbody = document.getElementById('table-prices-body');
    if (tbody) tbody.innerHTML = data.map(p => `
        <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
            <td class="p-6 font-black text-emerald-600">R$ ${formatPrice(p.price)}</td>
            <td class="p-6 text-slate-700 font-bold">${p.market}</td>
            <td class="p-6 text-slate-500">${p.product}</td>
            <td class="p-6 text-right">
                <button onclick="deleteItem('prices', ${p.id}, loadAdminPrices)" class="text-red-400 hover:text-red-600 font-bold uppercase text-[9px] tracking-widest">Excluir</button>
            </td>
        </tr>
    `).join('');
}

(window as any).deleteItem = async (table: string, id: number, callback: Function) => {
    if (confirm('Tem certeza?')) {
        await db.query(table, 'DELETE', id);
        callback();
        showToast('Item excluído');
    }
};

// Form handlers
document.getElementById('form-city')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('input-city-name') as HTMLInputElement).value;
    const state = (document.getElementById('input-city-state') as HTMLInputElement).value;
    await db.query('cities', 'INSERT', { name, state });
    loadAdminCities(); (e.target as HTMLFormElement).reset();
});

document.getElementById('form-market')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('market-name') as HTMLInputElement).value;
    const city = (document.getElementById('market-city') as HTMLSelectElement).value;
    const bairro = (document.getElementById('market-bairro') as HTMLInputElement).value;
    await db.query('markets', 'INSERT', { name, city, bairro });
    loadAdminMarkets(); (e.target as HTMLFormElement).reset();
});

document.getElementById('form-category')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('category-name') as HTMLInputElement).value;
    await db.query('categories', 'INSERT', { name });
    loadAdminCategories(); (e.target as HTMLFormElement).reset();
});

document.getElementById('form-product')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('product-name') as HTMLInputElement).value;
    const category = (document.getElementById('product-category') as HTMLSelectElement).value;
    const barcode = (document.getElementById('product-barcode') as HTMLInputElement).value;
    await db.query('products', 'INSERT', { name, category, barcode });
    loadAdminProducts(); (e.target as HTMLFormElement).reset();
});

document.getElementById('form-price')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const market = (document.getElementById('price-market') as HTMLSelectElement).value;
    const product = (document.getElementById('price-product') as HTMLSelectElement).value;
    const price = (document.getElementById('price-price') as HTMLInputElement).value;
    await db.query('prices', 'INSERT', { market, product, price, updated_at: new Date().toISOString() });
    loadAdminPrices(); (e.target as HTMLFormElement).reset();
});
