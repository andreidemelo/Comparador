
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
import { GoogleGenAI } from "@google/genai";

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
let openedListId: number | null = null;
let cameraStream: MediaStream | null = null;

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
    }
};
(window as any).showView = showView;

// --- CAMERA & BARCODE LOGIC WITH GEMINI ---
const openCamera = async () => {
    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-video') as HTMLVideoElement;
    if (!modal || !video) return;

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        video.srcObject = cameraStream;
        modal.style.display = 'flex';
    } catch (err) {
        showToast("Erro ao acessar câmera: " + err);
    }
};
(window as any).openCamera = openCamera;

const closeCamera = () => {
    const modal = document.getElementById('camera-modal');
    if (modal) modal.style.display = 'none';
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }
};
(window as any).closeCamera = closeCamera;

const captureSnapshot = async () => {
    const video = document.getElementById('camera-video') as HTMLVideoElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    closeCamera();
    showToast("Analisando código de barras...");
    
    // USANDO GEMINI PARA LER O CÓDIGO DE BARRAS OU IDENTIFICAR O PRODUTO
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
                    { text: 'Extraia apenas os números do código de barras (EAN) visível nesta imagem. Se não houver código de barras, identifique o nome do produto. Retorne apenas o número ou o nome, sem explicações.' }
                ]
            }
        });
        
        const result = response.text?.trim() || "";
        if (result) {
            const input = document.getElementById('quick-barcode-input') as HTMLInputElement;
            if (input) {
                input.value = result;
                quickSearch();
            }
        }
    } catch (err) {
        showToast("Falha ao identificar produto.");
    }
};
(window as any).captureSnapshot = captureSnapshot;

const quickSearch = async () => {
    const input = document.getElementById('quick-barcode-input') as HTMLInputElement;
    const val = input?.value.trim();
    if (!val) return;

    const resultsDiv = document.getElementById('quick-search-results');
    if (!resultsDiv) return;

    showToast("Buscando preços...");
    
    const products = await db.query('products', 'SELECT');
    // Busca flexível: por barcode ou nome
    const prod = products.find(p => p.barcode === val || p.name.toLowerCase().includes(val.toLowerCase()));

    if (!prod) {
        resultsDiv.innerHTML = `
            <div class="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl text-center">
                <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Produto "${val}" não encontrado no banco de dados.</p>
            </div>`;
        resultsDiv.classList.remove('hidden');
        return;
    }

    const markets = await db.query('markets', 'SELECT');
    const prices = await db.query('prices', 'SELECT');
    const prodPrices = prices.filter(p => p.product === prod.name);

    if (prodPrices.length === 0) {
        resultsDiv.innerHTML = `
            <div class="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl text-center">
                <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Sem preços cadastrados para "${prod.name}".</p>
            </div>`;
        resultsDiv.classList.remove('hidden');
        return;
    }

    // Acha o melhor preço
    const sortedPrices = prodPrices.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    const best = sortedPrices[0];

    resultsDiv.innerHTML = `
        <div class="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
            <div class="p-8 bg-slate-50 border-b flex justify-between items-center">
                <div>
                    <h3 class="font-extrabold text-slate-900 uppercase text-xs tracking-widest">Resultado da Pesquisa</h3>
                    <p class="text-lg font-black text-emerald-600 mt-1">${prod.name}</p>
                </div>
                <button onclick="document.getElementById('quick-search-results').classList.add('hidden')" class="text-slate-300 hover:text-slate-600">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${sortedPrices.map(p => `
                    <div class="p-6 rounded-2xl border ${p.id === best.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100'} transition-all">
                        <div class="flex justify-between items-start mb-4">
                            <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">${p.market}</span>
                            ${p.id === best.id ? '<span class="bg-emerald-500 text-white text-[8px] font-bold px-2 py-1 rounded-lg uppercase tracking-widest">Melhor Preço</span>' : ''}
                        </div>
                        <div class="text-2xl font-black text-slate-900">R$ ${formatPrice(p.price)}</div>
                        <p class="text-[9px] font-bold text-slate-400 mt-2 uppercase">Atualizado em: ${formatDate(p.updated_at)}</p>
                    </div>
                `).join('')}
            </div>
            <div class="p-6 bg-slate-900 text-center">
                <button onclick="addItemToCurrentList('${prod.name}')" class="text-white text-[10px] font-bold uppercase tracking-widest hover:text-emerald-400 transition-all">Adicionar à minha lista de compras</button>
            </div>
        </div>`;
    
    resultsDiv.classList.remove('hidden');
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
(window as any).quickSearch = quickSearch;

(window as any).addItemToCurrentList = (name: string) => {
    shoppingList.push({ name, quantity: 1 });
    updateListDisplay();
    showToast(`"${name}" adicionado à lista!`);
    document.getElementById('quick-search-results')?.classList.add('hidden');
};

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
        created_at: new Date().toISOString()
    };

    const res = await db.query('saved_lists', 'UPDATE', { id: openedListId, data: updateData });
    
    if (res && res.length > 0) {
        showToast(`Lista "${original.name}" atualizada com sucesso!`);
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
        confirmUpdateList();
    } else {
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
    const pSel = document.getElementById('select-product') as HTMLSelectElement;
    const qIn = document.getElementById('select-quantity') as HTMLInputElement;
    if (pSel.disabled || !pSel.value) { showToast("Selecione um produto"); return; }
    const prodName = pSel.value;
    const quantity = parseInt(qIn.value) || 1;
    const existing = shoppingList.find(i => i.name === prodName);
    if (existing) { existing.quantity += quantity; } else { shoppingList.push({ name: prodName, quantity }); }
    updateListDisplay();
    showToast("Item adicionado");
};

(window as any).editItem = async (name: string) => {
    const item = shoppingList.find(i => i.name === name);
    if (!item) return;
    shoppingList = shoppingList.filter(i => i.name !== name);
    updateListDisplay();
};

function updateListDisplay() {
    const c = document.getElementById('shopping-list-container');
    const a = document.getElementById('action-compare');
    if (!c) return;
    c.innerHTML = shoppingList.map(item => `
        <div class="group flex justify-between items-center p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div class="flex items-center gap-3">
                <div class="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-black ring-1 ring-emerald-100">x${item.quantity}</div>
                <span class="font-bold text-slate-700 text-sm">${item.name}</span>
            </div>
            <button onclick="editItem('${item.name}')" class="p-2 text-slate-300 hover:text-red-500 rounded-xl transition-all"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
        </div>`).join('');
    a?.classList.toggle('hidden', shoppingList.length === 0);
    const titleEl = document.getElementById('section-list-title');
    if (titleEl) titleEl.textContent = openedListId ? "Atualize sua Lista de Compras" : "Monte sua Lista de Compras";
    const saveBtn = document.querySelector('#action-compare button:first-child');
    if (saveBtn) {
        saveBtn.textContent = openedListId ? "Atualizar Lista" : "Salvar Lista";
        saveBtn.setAttribute('onclick', "handleSaveAction()");
    }
}

(window as any).runComparison = async () => {
    const res = document.getElementById('comparison-results');
    const markets = await db.query('markets', 'SELECT');
    const prices = await db.query('prices', 'SELECT');
    if (!res) return;

    let html = `
        <div class="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
            <div class="p-8 bg-slate-50 border-b flex justify-between items-center">
                <h3 class="font-extrabold text-slate-900 uppercase text-sm">Painel Comparativo</h3>
                <div class="flex gap-3">
                    <button onclick="handleSaveAction()" class="bg-emerald-600 text-white px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest">${openedListId ? 'Atualizar Lista' : 'Salvar Lista'}</button>
                    <button onclick="window.print()" class="bg-white text-slate-800 px-6 py-3 rounded-2xl text-[10px] font-bold uppercase border border-slate-100">Imprimir</button>
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-white text-[10px] font-bold uppercase text-slate-400">
                        <tr><th class="p-6">Item</th>${markets.map(m => `<th class="p-6 text-center">${m.name}</th>`).join('')}</tr>
                    </thead>
                    <tbody class="divide-y divide-slate-50 text-sm">`;

    let totals: any = {};
    markets.forEach(m => totals[m.name] = 0);
    shoppingList.forEach(item => {
        html += `<tr><td class="p-6 font-medium text-slate-600">${item.name} x${item.quantity}</td>`;
        markets.forEach(m => {
            const priceObj = prices.find(p => p.market === m.name && p.product === item.name);
            const lineTotal = priceObj ? parseFloat(priceObj.price) * item.quantity : 0;
            totals[m.name] += lineTotal;
            html += `<td class="p-6 text-center">${lineTotal ? `R$ ${formatPrice(lineTotal)}` : '---'}</td>`;
        });
        html += `</tr>`;
    });

    const validTotals = Object.values(totals).filter((v: any) => v > 0);
    const minTotal = validTotals.length > 0 ? Math.min(...(validTotals as number[])) : 0;

    html += `<tr class="bg-slate-900 text-white font-bold"><td class="p-8">TOTAL</td>`;
    markets.forEach(m => {
        const total = totals[m.name];
        html += `<td class="p-8 text-center ${total > 0 && total === minTotal ? 'bg-emerald-600' : ''}">R$ ${formatPrice(total)}</td>`;
    });
    html += `</tr></tbody></table></div></div>`;
    res.innerHTML = html;
    res.classList.remove('hidden');
    res.scrollIntoView({ behavior: 'smooth' });
};

// --- AUTH & ADMIN (MANTIDOS) ---
(window as any).logout = () => { localStorage.removeItem('app_session'); location.reload(); };
(window as any).setAuthMode = async (mode: string) => {
    document.getElementById('btn-tab-login')?.classList.toggle('bg-white', mode === 'login');
    document.getElementById('btn-tab-register')?.classList.toggle('bg-white', mode === 'register');
    document.getElementById('register-fields')?.classList.toggle('hidden', mode === 'login');
    if (mode === 'register') populateDropdown('auth-city', 'cities');
};
const authForm = document.getElementById('form-auth');
if (authForm) {
    authForm.onsubmit = async (e) => {
        e.preventDefault();
        const uIn = (document.getElementById('auth-username') as HTMLInputElement).value;
        const pIn = (document.getElementById('auth-password') as HTMLInputElement).value;
        const isLogin = document.getElementById('btn-tab-login')?.classList.contains('bg-white');
        if (!isLogin) {
            const eIn = (document.getElementById('auth-email') as HTMLInputElement).value;
            const cIn = (document.getElementById('auth-city') as HTMLSelectElement).value;
            await db.query('users', 'INSERT', { name: uIn, email: eIn, city: cIn, password: pIn });
            (window as any).setAuthMode('login');
        } else {
            const users = await db.query('users', 'SELECT');
            const u = users.find(u => u.name === uIn && u.password === pIn);
            if (u) { currentUser = u; localStorage.setItem('app_session', JSON.stringify(u)); renderApp(); }
        }
    };
}
async function populateDropdown(id: string, table: string) {
    const el = document.getElementById(id) as HTMLSelectElement;
    if (!el) return;
    const data = await db.query(table, 'SELECT');
    el.innerHTML = '<option value="">Selecionar...</option>' + data.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
}
async function loadAdminUsers() { /* ... admin logic ... */ }
