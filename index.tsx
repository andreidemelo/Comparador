
// --- ESTADO ---
let currentUser: string | null = null;
let authMode: 'login' | 'register' = 'login';
let shoppingList: any[] = [];
let comparisonResults: any[] = [];

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    setupAdminUser();
    initData();
    checkSession();
    renderShoppingDropdowns();
});

function setupAdminUser() {
    const users = JSON.parse(localStorage.getItem('supercompare_users_db') || '[]');
    if (!users.find((u: any) => u.name === 'administrador')) {
        users.push({ 
            name: 'administrador', 
            password: 'Mu@300413', 
            createdAt: new Date().toISOString() 
        });
        localStorage.setItem('supercompare_users_db', JSON.stringify(users));
    }
}

function initData() {
    if (!localStorage.getItem('supercompare_cities')) {
        localStorage.setItem('supercompare_cities', JSON.stringify([
            { name: 'São Paulo', state: 'SP' },
            { name: 'Rio de Janeiro', state: 'RJ' }
        ]));
    }
    if (!localStorage.getItem('supercompare_markets')) {
        localStorage.setItem('supercompare_markets', JSON.stringify([
            { name: 'Carrefour', city: 'São Paulo', state: 'SP' },
            { name: 'Pão de Açúcar', city: 'São Paulo', state: 'SP' }
        ]));
    }
    if (!localStorage.getItem('supercompare_categories')) {
        localStorage.setItem('supercompare_categories', JSON.stringify(['Arroz', 'Feijão', 'Leite']));
    }
}

function checkSession() {
    const session = localStorage.getItem('supercompare_session');
    if (session) {
        currentUser = JSON.parse(session).name;
        enterApp();
    }
}

// --- NAVEGAÇÃO ---
const showView = (viewId: string) => {
    document.querySelectorAll('#main-app main > div').forEach(div => div.classList.add('hidden'));
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.classList.remove('hidden');
        if (viewId === 'admin-users') renderAdminUsers();
        // Adicionar outros renders conforme necessário
    }
};
(window as any).showView = showView;

const setAuthMode = (mode: 'login' | 'register') => {
    authMode = mode;
    const btnLogin = document.getElementById('btn-tab-login');
    const btnRegister = document.getElementById('btn-tab-register');
    const btnSubmit = document.getElementById('btn-auth-submit');
    const errorEl = document.getElementById('auth-error');
    const successEl = document.getElementById('auth-success');

    if (btnLogin) btnLogin.className = mode === 'login' ? "flex-1 py-2 text-xs font-black uppercase rounded-lg bg-white shadow-sm text-emerald-600" : "flex-1 py-2 text-xs font-black uppercase rounded-lg text-gray-400";
    if (btnRegister) btnRegister.className = mode === 'register' ? "flex-1 py-2 text-xs font-black uppercase rounded-lg bg-white shadow-sm text-emerald-600" : "flex-1 py-2 text-xs font-black uppercase rounded-lg text-gray-400";
    if (btnSubmit) btnSubmit.textContent = mode === 'login' ? "Acessar App" : "Confirmar Cadastro";
    
    if (errorEl) errorEl.classList.add('hidden');
    if (successEl) successEl.classList.add('hidden');
};
(window as any).setAuthMode = setAuthMode;

// --- AUTENTICAÇÃO ---
const authForm = document.getElementById('form-auth');
if (authForm) {
    authForm.onsubmit = (e) => {
        e.preventDefault();
        const nameEl = document.getElementById('auth-username') as HTMLInputElement;
        const passEl = document.getElementById('auth-password') as HTMLInputElement;
        const errorEl = document.getElementById('auth-error');
        const successEl = document.getElementById('auth-success');
        
        const name = nameEl.value.trim();
        const pass = passEl.value;

        if (errorEl) errorEl.classList.add('hidden');
        if (successEl) successEl.classList.add('hidden');

        const users = JSON.parse(localStorage.getItem('supercompare_users_db') || '[]');

        if (authMode === 'register') {
            if (users.find((u: any) => u.name.toLowerCase() === name.toLowerCase())) {
                if (errorEl) {
                    errorEl.textContent = "Erro: Este usuário já existe.";
                    errorEl.classList.remove('hidden');
                }
                return;
            }
            users.push({ 
                name, 
                password: pass, 
                createdAt: new Date().toISOString() 
            });
            localStorage.setItem('supercompare_users_db', JSON.stringify(users));
            if (successEl) {
                successEl.textContent = "Sucesso! Conta criada. Agora faça login.";
                successEl.classList.remove('hidden');
            }
            setAuthMode('login');
        } else {
            const user = users.find((u: any) => u.name.toLowerCase() === name.toLowerCase() && u.password === pass);
            if (user) {
                currentUser = user.name;
                localStorage.setItem('supercompare_session', JSON.stringify({ name: user.name }));
                enterApp();
            } else {
                if (errorEl) {
                    errorEl.textContent = "Erro: Usuário ou senha incorretos";
                    errorEl.classList.remove('hidden');
                }
            }
        }
    };
}

function enterApp() {
    const authSec = document.getElementById('auth-section');
    const mainApp = document.getElementById('main-app');
    const headerName = document.getElementById('header-user-name');
    const navAdmin = document.getElementById('nav-admin');

    if (authSec) authSec.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');
    if (headerName) headerName.textContent = currentUser;
    if (navAdmin) navAdmin.classList.toggle('hidden', currentUser !== 'administrador');
    showView('home');
}

(window as any).logout = () => {
    localStorage.removeItem('supercompare_session');
    location.reload();
};

// --- ADMIN: USUÁRIOS ---
function renderAdminUsers() {
    const users = JSON.parse(localStorage.getItem('supercompare_users_db') || '[]');
    const tableBody = document.getElementById('table-admin-users');
    
    if (!tableBody) return;

    tableBody.innerHTML = users.map((u: any) => {
        const date = u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'N/A';

        return `
            <tr>
                <td class="p-4">${u.name}</td>
                <td class="p-4 text-gray-500 font-normal">${date}</td>
                <td class="p-4 font-mono text-gray-400">${u.password}</td>
                <td class="p-4 text-right">
                    ${u.name === 'administrador' ? 
                        '<span class="text-xs text-gray-400 italic">Sistema</span>' : 
                        `<button onclick="deleteUser('${u.name}')" class="text-red-500 hover:underline">Remover</button>`}
                </td>
            </tr>
        `;
    }).join('');
}

const deleteUser = (name: string) => {
    if(!confirm(`Excluir usuário "${name}" permanentemente?`)) return;
    let users = JSON.parse(localStorage.getItem('supercompare_users_db') || '[]');
    localStorage.setItem('supercompare_users_db', JSON.stringify(users.filter((u: any) => u.name !== name)));
    renderAdminUsers();
    showToast("Usuário removido");
};
(window as any).deleteUser = deleteUser;

// --- UTILITÁRIOS ---
function showToast(txt: string) {
    const t = document.getElementById('toast');
    const tx = document.getElementById('toast-text');
    if (t && tx) {
        tx.textContent = txt;
        t.classList.remove('translate-y-20');
        setTimeout(() => t.classList.add('translate-y-20'), 2000);
    }
}

function renderShoppingDropdowns() {
    const cats = JSON.parse(localStorage.getItem('supercompare_categories') || '[]');
    const selCat = document.getElementById('select-category') as HTMLSelectElement;
    if (!selCat) return;
    selCat.innerHTML = '<option value="">Categoria</option>' + cats.map((c: any) => `<option value="${c}">${c}</option>`).join('');
    selCat.onchange = (e: any) => {
        const prodSelect = document.getElementById('select-product') as HTMLSelectElement;
        if (!prodSelect) return;
        const products = JSON.parse(localStorage.getItem('supercompare_products') || '[]');
        const filtered = products.filter((p: any) => p.category === e.target.value);
        prodSelect.innerHTML = filtered.map((p: any) => `<option value="${p.name}">${p.name}</option>`).join('');
        prodSelect.disabled = false;
    };
}

// Funções globais placeholder para não quebrar o HTML inicial
(window as any).addItem = () => {};
(window as any).runComparison = () => {};
(window as any).removeItem = () => {};
(window as any).generatePDFList = () => {};
(window as any).saveList = () => {};
