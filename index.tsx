
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

/**
 * --- SCRIPT SQL PARA O SUPABASE ---
 * 
 * create table if not exists prices (
 *    id bigint primary key generated always as identity,
 *    market text not null,
 *    product text not null,
 *    price numeric not null,
 *    category text,
 *    updated_at timestamp with time zone default now(),
 *    created_at timestamp with time zone default now()
 * );
 * 
 * create table if not exists saved_lists (
 *    id bigint primary key generated always as identity, 
 *    user_id bigint references users(id), 
 *    name text, 
 *    items text, 
 *    created_at timestamp with time zone default now()
 * );
 * alter table saved_lists disable row level security;
 * alter table prices disable row level security;
 */

const SUPABASE_URL = 'https://zagebrolhkzdqezmijdi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8PbA4ZgMUEYzTRzGhyvMzA_5xebA4Tu';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

class Database {
    async query(table: string, action: 'SELECT' | 'INSERT' | 'DELETE' | 'UPDATE', params: any = null): Promise<any[]> {
        console.log(`[Database] ${action} em ${table}`, params);
        try {
            if (action === 'SELECT') {
                let query = supabase.from(table).select('*');
                if (params && params.eq && params.eq[1] !== undefined && params.eq[1] !== null) {
                    query = query.eq(params.eq[0], params.eq[1]);
                }
                
                // Ordenação padrão por tabela
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
                const idToDelete = Number(params);
                if (isNaN(idToDelete)) throw new Error("ID de registro inválido para exclusão.");
                
                const { error } = await supabase.from(table).delete().eq('id', idToDelete);
                if (error) throw error;
                return [];
            }
            
            if (action === 'UPDATE') {
                const idToUpdate = Number(params.id);
                const { data, error } = await supabase.from(table).update(params.data).eq('id', idToUpdate).select();
                if (error) throw error;
                return data || [];
            }
        } catch (err: any) {
            console.error(`[Database Error] ${action} em ${table}:`, err);
            throw err;
        }
        return [];
    }
}

const db = new Database();

// --- ESTADO DO APP ---
let currentUser: any = null;
let shoppingList: { name: string, quantity: number }[] = [];
let currentListId: any = null; 
let html5QrCode: any = null;

// --- AUXILIARES ---
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
        setTimeout(() => t.classList.add('translate-y-32'), 4000); 
    }
};

const setVal = (id: string, val: any) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    if (el) el.value = val === null || val === undefined ? '' : val.toString();
};

// --- LÓGICA DO SCANNER ---
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
                if (targetId === 'price-barcode') (window as any).lookupBarcodeForPrice(decodedText);
                if (targetId === 'product-barcode') (window as any).checkBarcodeOnProductForm(decodedText);
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

// --- PESQUISA RÁPIDA ---
(window as any).lookupBarcode = async (barcode: string) => {
    const nameInput = document.getElementById('quick-search-product-name') as HTMLInputElement;
    if (!barcode) { if (nameInput) nameInput.value = ""; return; }
    const products = await db.query('products', 'SELECT');
    const product = products.find(p => p.barcode?.toString().trim() === barcode.trim());
    if (nameInput) nameInput.value = product ? product.name : "Produto não encontrado";
};

// Verificação de duplicidade no formulário de cadastro de produto
(window as any).checkBarcodeOnProductForm = async (barcode: string) => {
    const barcodeTrimmed = barcode.trim();
    const btnSubmit = document.querySelector('#form-product button[type="submit"]') as HTMLButtonElement;
    
    if (!barcodeTrimmed) {
        if (btnSubmit) btnSubmit.textContent = "Salvar Produto";
        return;
    }

    try {
        const products = await db.query('products', 'SELECT');
        const existing = products.find(p => p.barcode && p.barcode.toString().trim() === barcodeTrimmed);
        
        if (existing) {
            alert("Este item já está cadastrado!");
            // Preencher os campos para edição
            setVal('product-id', existing.id);
            setVal('product-name', existing.name);
            setVal('product-category', existing.category);
            // Alterar o texto do botão
            if (btnSubmit) btnSubmit.textContent = "Atualizar";
        } else {
            // Se não existe, limpa os campos de dados (exceto barcode) e garante que o botão diz "Salvar"
            setVal('product-id', '');
            setVal('product-name', '');
            setVal('product-category', '');
            if (btnSubmit) btnSubmit.textContent = "Salvar Produto";
        }
    } catch (e) {
        console.error("Erro ao verificar barcode no formulário de produtos:", e);
    }
};

// Checar duplicatas ou existência de preço
const checkExistingPrice = async () => {
    const marketSelect = document.getElementById('price-market') as HTMLSelectElement;
    const productInput = document.getElementById('price-product-display') as HTMLInputElement;
    if (!marketSelect || !productInput) return;

    const market = marketSelect.value;
    const productName = productInput.value;
    const priceIdInput = document.getElementById('price-id') as HTMLInputElement;
    const saveBtn = document.getElementById('btn-save-price') as HTMLButtonElement;

    if (!market || !productName) {
        if (priceIdInput) priceIdInput.value = "";
        if (saveBtn) saveBtn.textContent = "Salvar Registro";
        return;
    }

    try {
        const prices = await db.query('prices', 'SELECT');
        const existing = prices.find(p => p.market === market && p.product === productName);
        
        if (existing) {
            if (priceIdInput) priceIdInput.value = existing.id;
            if (saveBtn) saveBtn.textContent = "ATUALIZAR";
            setVal('price-price', existing.price);
            showToast("Registro existente encontrado!");
        } else {
            if (priceIdInput && !priceIdInput.getAttribute('data-editing')) {
                priceIdInput.value = "";
                if (saveBtn) saveBtn.textContent = "Salvar Registro";
            }
        }
    } catch (e) { console.error(e); }
};

(window as any).lookupBarcodeForPrice = async (barcode: string) => {
    const displayInput = document.getElementById('price-product-display') as HTMLInputElement;
    const categoryHidden = document.getElementById('price-category') as HTMLInputElement;
    const barcodeInput = document.getElementById('price-barcode') as HTMLInputElement;
    const priceInput = document.getElementById('price-price') as HTMLInputElement;
    const barcodeTrimmed = barcode.trim();
    
    if (!barcodeTrimmed) { 
        if (displayInput) displayInput.value = ""; 
        if (categoryHidden) categoryHidden.value = "";
        (window as any).filterPriceList();
        checkExistingPrice();
        return; 
    }
    
    try {
        const products = await db.query('products', 'SELECT');
        const product = products.find(p => p.barcode && p.barcode.toString().trim() === barcodeTrimmed);
        
        if (product) {
            if (displayInput) displayInput.value = product.name;
            if (categoryHidden) categoryHidden.value = product.category;
            showToast(`Identificado: ${product.name}`);
            // Atualiza a visualização e checa se já tem preço cadastrado para esse produto no mercado selecionado
            (window as any).filterPriceList();
            await checkExistingPrice();
        } else {
            // Se não encontrar o item no banco de dados
            if (confirm("Item não encontrado no banco de dados. Deseja cadastrar este novo item agora?")) {
                // Direcionar para o cadastro de produtos
                showView('admin-products');
                // Preencher o campo de código de barras na tela de produtos automaticamente
                setTimeout(() => {
                    const adminProductBarcode = document.getElementById('product-barcode') as HTMLInputElement;
                    if (adminProductBarcode) {
                        adminProductBarcode.value = barcodeTrimmed;
                        (window as any).checkBarcodeOnProductForm(barcodeTrimmed);
                    }
                }, 200);
            } else {
                // Resetar os campos solicitados
                if (barcodeInput) barcodeInput.value = "";
                if (displayInput) displayInput.value = "";
                if (priceInput) priceInput.value = "";
                if (categoryHidden) categoryHidden.value = "";
                // Manter o supermercado (price-market) intacto
                (window as any).filterPriceList();
            }
        }
    } catch (e) {
        console.error("Erro ao buscar produto por barcode:", e);
    }
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

// --- NAVEGAÇÃO E INIT ---
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setupPriceForm();
});

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

// --- LISTAS SALVAS ---
async function renderSavedLists() {
    const container = document.getElementById('saved-lists-container');
    if (!container) return;
    container.innerHTML = `<div class="col-span-full py-20 text-center"><p class="text-slate-400 animate-pulse font-bold uppercase text-xs">Buscando listas...</p></div>`;
    
    if (!currentUser?.id) return;
    
    try {
        const lists = await db.query('saved_lists', 'SELECT', { eq: ['user_id', currentUser.id] });
        if (!lists.length) {
            container.innerHTML = `<div class="col-span-full py-20 text-center space-y-4"><p class="text-slate-400 font-bold uppercase text-xs">Nenhuma lista salva encontrada.</p></div>`;
            return;
        }

        container.innerHTML = lists.map(list => `
            <div class="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6 hover:border-emerald-500 transition-all group animate-in">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="font-bold text-slate-800 text-lg">${list.name}</h3>
                        <p class="text-[10px] text-slate-400 font-bold uppercase">Criada em: ${formatDate(list.created_at)}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="editList('${list.id}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-xl" title="Editar"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                        <button onclick="deleteList('${list.id}')" class="p-2 text-red-500 hover:bg-red-50 rounded-xl" title="Excluir"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    </div>
                </div>
                <button onclick="loadListToCompare('${list.id}')" class="w-full py-4 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all">Ver Comparação</button>
            </div>`).join('');
    } catch(e) { console.error(e); }
}

(window as any).editList = async (id: any) => {
    try {
        const listData = await db.query('saved_lists', 'SELECT', { eq: ['id', id] });
        const list = listData[0];
        if (!list) return;
        currentListId = id;
        shoppingList = typeof list.items === 'string' ? JSON.parse(list.items || '[]') : (list.items || []);
        showView('build-list');
        setTimeout(() => setVal('input-list-name', list.name), 100);
    } catch(e) { showToast("Erro ao carregar lista"); }
};

(window as any).deleteList = async (id: any) => {
    if (confirm('Deseja realmente excluir esta lista?')) {
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

// --- MONTAGEM DE LISTA ---
function loadHome() {
    currentListId = null;
    shoppingList = [];
    const res = document.getElementById('comparison-results');
    if (res) res.classList.add('hidden');
    document.getElementById('build-list-header')?.classList.remove('hidden');
    document.getElementById('build-list-main-content')?.classList.remove('hidden');
}

function loadBuildList() {
    populateDropdown('select-category', 'categories');
    updateListDisplay();
    if (!currentListId) setVal('input-list-name', '');
    document.getElementById('build-list-header')?.classList.remove('hidden');
    document.getElementById('build-list-main-content')?.classList.remove('hidden');
    document.getElementById('comparison-results')?.classList.add('hidden');
}

(window as any).addItem = () => {
    const pSel = document.getElementById('select-product') as HTMLSelectElement;
    const qIn = document.getElementById('select-quantity') as HTMLInputElement;
    if (!pSel || pSel.disabled || !pSel.value) return;
    const existing = shoppingList.find(i => i.name === pSel.value);
    const qty = parseInt(qIn?.value || "1") || 1;
    if (existing) existing.quantity += qty;
    else shoppingList.push({ name: pSel.value, quantity: qty });
    if (qIn) qIn.value = "1";
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
                <button onclick="editItem('${item.name}')" class="text-slate-300 hover:text-blue-500 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                <button onclick="removeItem('${item.name}')" class="text-slate-300 hover:text-red-500 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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
            setVal('select-category', product.category);
            await (window as any).onCategoryChangeHome();
            setVal('select-product', name);
            setVal('select-quantity', item.quantity);
            shoppingList = shoppingList.filter(i => i.name !== name);
            updateListDisplay();
            showToast("Item para edição");
        }
    } catch (e) { console.error(e); }
};

(window as any).removeItem = (name: string) => {
    shoppingList = shoppingList.filter(i => i.name !== name);
    updateListDisplay();
};

(window as any).saveList = async () => {
    const nameInput = document.getElementById('input-list-name') as HTMLInputElement;
    if (!nameInput?.value.trim()) return showToast('Dê um nome para a lista');
    if (!shoppingList.length) return showToast('Lista vazia');
    const data = { user_id: currentUser.id, name: nameInput.value, items: JSON.stringify(shoppingList), created_at: new Date().toISOString() };
    try {
        if (currentListId) await db.query('saved_lists', 'UPDATE', { id: currentListId, data });
        else await db.query('saved_lists', 'INSERT', data);
        showToast('Lista Salva!');
        showView('home');
    } catch(e) { console.error(e); }
};

// --- COMPARAÇÃO ---
(window as any).runComparison = async () => {
    const res = document.getElementById('comparison-results');
    if (!res) return;
    
    try {
        const markets = await db.query('markets', 'SELECT');
        const prices = await db.query('prices', 'SELECT');
        let totals: any = {};
        markets.forEach(m => totals[m.name] = 0);
        
        // Ocultar elementos de edição para mostrar "somente o painel"
        document.getElementById('build-list-header')?.classList.add('hidden');
        document.getElementById('build-list-main-content')?.classList.add('hidden');

        let html = `<div class="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden animate-in">
            <div class="p-8 bg-slate-50 border-b flex justify-between items-center">
                <h3 class="font-extrabold text-slate-900 uppercase text-sm">Painel Comparativo</h3>
                <button onclick="backToEditList()" class="text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Voltar para Montagem
                </button>
            </div>
            <div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-white text-[10px] font-bold uppercase text-slate-400"><tr><th class="p-6">Lista</th>${markets.map(m => `<th class="p-6 text-center">${m.name}</th>`).join('')}</tr></thead><tbody class="divide-y divide-slate-50 text-sm">`;
        
        shoppingList.forEach(item => {
            html += `<tr><td class="p-6 font-medium text-slate-600"><span class="font-bold text-slate-900">${item.name}</span> (x${item.quantity})</td>`;
            markets.forEach(m => {
                const pObj = prices.find(p => p.market === m.name && p.product === item.name);
                const priceVal = pObj ? parseFloat(pObj.price) : 0;
                
                if (pObj && priceVal > 0) {
                    const line = priceVal * item.quantity;
                    totals[m.name] += line;
                    const dateInfo = pObj.updated_at || pObj.created_at;
                    html += `<td class="p-6 text-center">
                        <div class="flex flex-col items-center">
                            <span class="font-bold text-slate-800">R$ ${formatPrice(line)}</span>
                            <span class="text-[9px] text-slate-400 font-normal mt-0.5">${formatDate(dateInfo)}</span>
                        </div>
                    </td>`;
                } else {
                    html += `<td class="p-6 text-center"></td>`;
                }
            });
            html += `</tr>`;
        });
        
        const valid = Object.values(totals).filter((v: any) => v > 0);
        const min = valid.length ? Math.min(...(valid as number[])) : 0;
        html += `<tr class="bg-slate-900 text-white font-bold"><td class="p-8">TOTAL</td>`;
        markets.forEach(m => {
            const currentTotal = totals[m.name];
            const isBest = currentTotal > 0 && currentTotal === min;
            
            if (currentTotal > 0) {
                html += `<td class="p-8 text-center ${isBest ? 'bg-emerald-600' : ''}">R$ ${formatPrice(currentTotal)} ${isBest ? '🏆' : ''}</td>`;
            } else {
                html += `<td class="p-8 text-center"></td>`;
            }
        });
        html += `</tr></tbody></table></div></div>`;
        
        res.innerHTML = html; 
        res.classList.remove('hidden'); 
        res.scrollIntoView({ behavior: 'smooth' });
    } catch(e) { 
        console.error(e); 
        showToast("Erro ao gerar comparação");
    }
};

(window as any).backToEditList = () => {
    document.getElementById('build-list-header')?.classList.remove('hidden');
    document.getElementById('build-list-main-content')?.classList.remove('hidden');
    document.getElementById('comparison-results')?.classList.add('hidden');
};

// --- ADMIN ---
async function renderAdminUsers() {
    populateDropdown('user-admin-city', 'cities');
    const users = await db.query('users', 'SELECT');
    const body = document.getElementById('table-users-body');
    if (body) body.innerHTML = users.map(u => `<tr class="border-b"> <td class="p-6 font-bold">${u.name}</td> <td class="p-6">${u.email || '-'}</td> <td class="p-6">${u.city || '-'}</td> <td class="p-6">${formatDate(u.created_at)}</td> <td class="p-6 text-right"><button onclick="editUser('${u.id}')" class="text-emerald-600 font-bold text-[10px]">Editar</button></td> </tr>`).join('');
}
async function renderAdminCities() {
    const cities = await db.query('cities', 'SELECT');
    const body = document.getElementById('table-cities-body');
    if (body) body.innerHTML = cities.map(c => `<tr class="border-b"> <td class="p-6 font-bold">${c.name}</td> <td class="p-6">${c.state}</td> <td class="p-6 text-right"><button onclick="editCity('${c.id}')" class="text-emerald-600 font-bold text-[10px]">Editar</button></td> </tr>`).join('');
}
async function renderAdminMarkets() {
    populateDropdown('market-city', 'cities');
    const markets = await db.query('markets', 'SELECT');
    const body = document.getElementById('table-markets-body');
    if (body) body.innerHTML = markets.map(m => `<tr class="border-b"> <td class="p-6 font-bold">${m.name}</td> <td class="p-6">${m.city}</td> <td class="p-6">${m.bairro}</td> <td class="p-6 text-right"><button onclick="editMarket('${m.id}')" class="text-emerald-600 font-bold text-[10px]">Editar</button></td> </tr>`).join('');
}
async function renderAdminCategories() {
    const cats = await db.query('categories', 'SELECT');
    const body = document.getElementById('table-categories-body');
    if (body) body.innerHTML = cats.map(c => `<tr class="border-b"> <td class="p-6 font-bold">${c.name}</td> <td class="p-6 text-right"><button onclick="editCategory('${c.id}')" class="text-emerald-600 font-bold text-[10px]">Editar</button></td> </tr>`).join('');
}
async function renderAdminProducts() {
    populateDropdown('product-category', 'categories');
    const prods = await db.query('products', 'SELECT');
    const body = document.getElementById('table-products-body');
    if (body) body.innerHTML = prods.map(p => `
        <tr class="border-b hover:bg-slate-50 transition-colors"> 
            <td class="p-6 font-bold text-slate-800">${p.name}</td> 
            <td class="p-6 text-slate-500">${p.category}</td> 
            <td class="p-6 text-slate-500">${p.barcode || '-'}</td> 
            <td class="p-6 text-right">
                <div class="flex flex-col items-end gap-2">
                    <button onclick="editProduct('${p.id}')" class="text-blue-600 font-bold text-[10px] uppercase tracking-wider hover:underline">Editar</button>
                    <button onclick="deleteProduct('${p.id}')" class="text-red-600 font-bold text-[10px] uppercase tracking-wider hover:underline">Excluir</button>
                </div>
            </td> 
        </tr>`).join('');
}

(window as any).filterPriceList = () => {
    const m = (document.getElementById('price-market') as HTMLSelectElement)?.value || "";
    const p = (document.getElementById('price-product-display') as HTMLInputElement)?.value || "";
    renderAdminPrices(m, p);
    checkExistingPrice(); 
};

async function renderAdminPrices(filterMarket = "", filterProduct = "") {
    if (!filterMarket && !filterProduct) populateDropdown('price-market', 'markets');
    
    const prcs = await db.query('prices', 'SELECT');
    const body = document.getElementById('table-prices-body');
    if (!body) return;

    const filtered = prcs.filter(p => {
        const matchesM = filterMarket ? p.market === filterMarket : true;
        const matchesP = filterProduct ? p.product.toLowerCase().includes(filterProduct.toLowerCase()) : true;
        return matchesM && matchesP;
    });

    body.innerHTML = filtered.map(p => `
        <tr class="border-b hover:bg-slate-50 transition-colors"> 
            <td class="p-3 md:p-6 font-bold text-emerald-600 text-xs md:text-sm">R$ ${formatPrice(p.price)}</td> 
            <td class="p-3 md:p-6 text-xs md:text-sm text-slate-500">${p.market}</td> 
            <td class="p-3 md:p-6 text-xs md:text-sm font-medium text-slate-800">${p.product}</td> 
            <td class="p-3 md:p-6 text-right">
                <div class="flex flex-col items-end gap-2">
                    <button onclick="editPrice('${p.id}')" class="w-full md:w-auto bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold text-[9px] uppercase tracking-wider hover:bg-blue-100 transition-all">Alterar</button>
                    <button onclick="deletePrice('${p.id}')" class="w-full md:w-auto bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-bold text-[9px] uppercase tracking-wider hover:bg-red-100 transition-all">Excluir</button>
                </div>
            </td> 
        </tr>`).join('');
}

// --- FORMS E UTILS ---
async function populateDropdown(id: string, table: string) {
    const el = document.getElementById(id) as HTMLSelectElement;
    if (!el) return;
    const data = await db.query(table, 'SELECT');
    el.innerHTML = '<option value="">Selecionar...</option>' + data.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
}

(window as any).onCategoryChangeHome = async () => {
    const cat = (document.getElementById('select-category') as HTMLSelectElement)?.value;
    const pSel = document.getElementById('select-product') as HTMLSelectElement;
    if (!pSel) return;
    pSel.disabled = !cat;
    if (cat) {
        const prods = await db.query('products', 'SELECT');
        pSel.innerHTML = prods.filter(p => p.category === cat).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    }
};

const setupPriceForm = () => {
    const f = document.getElementById('form-price-custom');
    if (!f) return;
    f.onsubmit = async (e) => {
        e.preventDefault();
        const market = (document.getElementById('price-market') as HTMLSelectElement).value;
        const productName = (document.getElementById('price-product-display') as HTMLInputElement).value;
        const priceVal = parseFloat((document.getElementById('price-price') as HTMLInputElement).value) || 0;
        const editId = (document.getElementById('price-id') as HTMLInputElement).value;
        let category = (document.getElementById('price-category') as HTMLInputElement).value;

        if (!productName.trim()) return showToast("Insira o nome do produto");
        if (!category) {
            const products = await db.query('products', 'SELECT');
            category = products.find(p => p.name === productName)?.category || "Geral";
        }

        const data = { 
            market, 
            product: productName, 
            price: priceVal, 
            category,
            updated_at: new Date().toISOString() // Data de registro ou atualização
        };

        try {
            if (editId) await db.query('prices', 'UPDATE', { id: editId, data });
            else await db.query('prices', 'INSERT', data);
            
            showToast(editId ? 'Preço atualizado!' : 'Preço salvo!');
            
            // Reset parcial corrigido: limpa campos de produto/valor, mantém mercado
            const priceIdInput = document.getElementById('price-id') as HTMLInputElement;
            if (priceIdInput) {
                priceIdInput.value = "";
                priceIdInput.removeAttribute('data-editing');
            }
            setVal('price-barcode', '');
            setVal('price-product-display', '');
            setVal('price-price', '');
            setVal('price-category', '');
            
            const saveBtn = document.getElementById('btn-save-price') as HTMLButtonElement;
            if (saveBtn) saveBtn.textContent = "Salvar Registro";
            
            (window as any).filterPriceList();
        } catch(err) { showToast("Erro ao salvar"); }
    };
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
        showToast('Sucesso!'); (e.target as HTMLFormElement).reset(); 
        
        // Reset adicional para o botão do formulário de produto
        if (id === 'form-product') {
            const btnSubmit = f.querySelector('button[type="submit"]') as HTMLButtonElement;
            if (btnSubmit) btnSubmit.textContent = "Salvar Produto";
        }
        
        if (callback) callback();
    };
};

setupForm('form-city', 'cities', ['input-city-name', 'input-city-state'], renderAdminCities);
setupForm('form-market', 'markets', ['market-name', 'market-city', 'market-bairro'], renderAdminMarkets);
setupForm('form-category', 'categories', ['category-name'], renderAdminCategories);
setupForm('form-product', 'products', ['product-barcode', 'product-name', 'product-category'], renderAdminProducts);
setupForm('form-user-admin', 'users', ['user-admin-name', 'user-admin-email', 'user-admin-city', 'user-admin-password'], renderAdminUsers);

// --- HANDLERS DE EDIÇÃO ---
(window as any).editCity = (id: any) => db.query('cities', 'SELECT').then(data => { 
    const x = data.find(i => i.id == id); 
    if (x) { setVal('city-id', x.id); setVal('input-city-name', x.name); setVal('input-city-state', x.state); } 
});
(window as any).editMarket = (id: any) => db.query('markets', 'SELECT').then(data => { 
    const x = data.find(i => i.id == id); 
    if (x) { setVal('market-id', x.id); setVal('market-name', x.name); setVal('market-city', x.city); setVal('market-bairro', x.bairro); } 
});
(window as any).editCategory = (id: any) => db.query('categories', 'SELECT').then(data => { 
    const x = data.find(i => i.id == id); 
    if (x) { setVal('category-id', x.id); setVal('category-name', x.name); } 
});
(window as any).editProduct = (id: any) => db.query('products', 'SELECT').then(data => { 
    const x = data.find(i => i.id == id); 
    if (x) { 
        setVal('product-id', x.id); 
        setVal('product-category', x.category); 
        setVal('product-name', x.name); 
        setVal('product-barcode', x.barcode || '');
        const btnSubmit = document.querySelector('#form-product button[type="submit"]') as HTMLButtonElement;
        if (btnSubmit) btnSubmit.textContent = "Atualizar";
    } 
});

(window as any).deleteProduct = async (id: any) => {
    if (confirm('Tem certeza que deseja excluir este produto? Isso também pode afetar registros de preços vinculados.')) {
        try {
            await db.query('products', 'DELETE', id);
            showToast('Produto excluído!');
            renderAdminProducts();
        } catch (e) {
            console.error(e);
            showToast("Erro ao excluir produto");
        }
    }
};

(window as any).editPrice = async (id: any) => { 
    const prices = await db.query('prices', 'SELECT'); 
    const p = prices.find(i => i.id == id); 
    if (p) { 
        const idInput = document.getElementById('price-id') as HTMLInputElement;
        if (idInput) {
            idInput.value = p.id;
            idInput.setAttribute('data-editing', 'true');
        }
        setVal('price-market', p.market); 
        setVal('price-category', p.category || ''); 
        setVal('price-product-display', p.product);
        setVal('price-price', p.price); 
        
        const saveBtn = document.getElementById('btn-save-price') as HTMLButtonElement;
        if (saveBtn) saveBtn.textContent = "ATUALIZAR";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } 
};

// --- FUNÇÃO DE EXCLUSÃO CORRIGIDA ---
(window as any).deletePrice = async (id: any) => {
    console.log("[Delete] Solicitando exclusão do ID:", id);
    if (!id || id === 'undefined' || id === 'null') {
        showToast("ID inválido para exclusão.");
        return;
    }
    
    if (confirm('Tem certeza que deseja excluir este registro de preço permanentemente?')) {
        try {
            showToast("Excluindo...");
            
            // Chamar diretamente para garantir a execução
            await db.query('prices', 'DELETE', id);
            
            showToast('Registro excluído!');
            
            // Recarregar a lista filtrada
            const m = (document.getElementById('price-market') as HTMLSelectElement)?.value || "";
            const p = (document.getElementById('price-product-display') as HTMLInputElement)?.value || "";
            renderAdminPrices(m, p);
            
        } catch(e: any) { 
            console.error("[Delete Price Error]", e);
            alert("Erro ao excluir do banco de dados: " + (e.message || "Verifique sua conexão ou permissões."));
        }
    }
};

(window as any).editUser = (id: any) => db.query('users', 'SELECT').then(data => { 
    const x = data.find(i => i.id == id); 
    if (x) { setVal('user-admin-id', x.id); setVal('user-admin-name', x.name); setVal('user-admin-email', x.email || ''); setVal('user-admin-city', x.city || ''); setVal('user-admin-password', x.password); } 
});
